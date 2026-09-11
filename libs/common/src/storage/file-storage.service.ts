import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ENTITY_FILE_EXT, INDEX_FILE_NAME } from '../constants';

/**
 * 基于 txt 文件的实体存储。
 *
 * 约定：
 * - 一个实体一个文件：`<dir>/<id>.txt`，内容为 pretty-print 的 JSON
 * - 自增计数器：`<dir>/index.txt`，内容是纯数字
 * - 写入使用「临时文件 + rename」保证原子性（rename 在同分区上是原子的）
 *
 * 并发：同一路径的写操作通过内存队列串行化，避免「读-改-写」互相覆盖。
 */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);

  /** key = 被锁定的文件绝对路径，value = 该路径上的串行链尾 */
  private readonly queues = new Map<string, Promise<unknown>>();

  /** 已经创建过的目录，避免每次都 mkdir */
  private readonly readyDirs = new Set<string>();

  /** 确保目录存在 */
  async ensureDir(dir: string): Promise<void> {
    if (this.readyDirs.has(dir)) {
      return;
    }
    await fs.mkdir(dir, { recursive: true });
    this.readyDirs.add(dir);
  }

  private buildEntityPath(dir: string, id: string): string {
    return join(dir, `${id}${ENTITY_FILE_EXT}`);
  }

  /**
   * 把 task 追加到 key 对应的串行队列尾部。
   * 前一个任务失败不会阻断后续任务（第二个参数传了同一个 task 作为 rejection handler）。
   */
  private withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const current = previous.then(task, task);
    // 队列里存"已消化异常"的版本，防止未处理的 rejection 冒泡
    this.queues.set(
      key,
      current.then(
        () => undefined,
        () => undefined,
      ),
    );
    return current;
  }

  /** 读取实体；文件不存在返回 null */
  async readEntity<T>(dir: string, id: string): Promise<T | null> {
    await this.ensureDir(dir);
    const filePath = this.buildEntityPath(dir, id);

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      // 文件被人为改坏了，给出明确错误而不是让 JSON.parse 的报错裸奔
      throw new InternalServerErrorException(`实体文件格式损坏，无法解析 JSON: ${filePath}`);
    }
  }

  /** 写入实体（原子替换），同一路径的写入串行执行 */
  async writeEntity<T>(dir: string, id: string, entity: T): Promise<void> {
    const filePath = this.buildEntityPath(dir, id);

    return this.withLock(filePath, async () => {
      await this.ensureDir(dir);
      // 临时文件名带上 pid + 时间戳，避免多进程环境下互相踩踏
      const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(entity, null, 2), 'utf8');
      await fs.rename(tempPath, filePath);
    });
  }

  /** 删除实体；不存在时静默返回 */
  async deleteEntity(dir: string, id: string): Promise<void> {
    const filePath = this.buildEntityPath(dir, id);
    return this.withLock(filePath, async () => {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    });
  }

  /** 列出目录下全部实体（自动跳过 index.txt 与非 .txt 文件） */
  async listEntities<T>(dir: string): Promise<T[]> {
    await this.ensureDir(dir);
    const fileNames = await fs.readdir(dir);

    const entities: T[] = [];
    for (const fileName of fileNames) {
      if (!fileName.endsWith(ENTITY_FILE_EXT) || fileName === INDEX_FILE_NAME) {
        continue;
      }
      const id = fileName.slice(0, -ENTITY_FILE_EXT.length);
      const entity = await this.readEntity<T>(dir, id);
      if (entity !== null) {
        entities.push(entity);
      }
    }
    return entities;
  }

  /**
   * 分配下一个自增 ID，形如 BUG-0001 / FILE-0001。
   * 读 index.txt → +1 → 写回，整个过程在队列里串行，保证不重号。
   */
  async nextId(dir: string, prefix: string, pad = 4): Promise<string> {
    const indexPath = join(dir, INDEX_FILE_NAME);

    return this.withLock(indexPath, async () => {
      await this.ensureDir(dir);

      let current = 0;
      try {
        const raw = await fs.readFile(indexPath, 'utf8');
        current = Number.parseInt(raw.trim(), 10) || 0;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        // 首次运行，index.txt 还不存在，从 0 开始
      }

      const next = current + 1;
      const tempPath = `${indexPath}.${process.pid}.tmp`;
      await fs.writeFile(tempPath, String(next), 'utf8');
      await fs.rename(tempPath, indexPath);

      this.logger.debug(`分配 ID: ${prefix}-${String(next).padStart(pad, '0')} (目录: ${dir})`);
      return `${prefix}-${String(next).padStart(pad, '0')}`;
    });
  }
}
