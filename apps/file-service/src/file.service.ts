import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileMeta, FileStorageService, resolveDataDir } from '@bug-track/common';
import { promises as fs } from 'fs';
import { extname, join } from 'path';

/** 落盘所需的最小输入 */
export interface SaveFileInput {
  originalName: string;
  mimeType: string;
  content: Buffer;
  uploadedBy: string;
}

/**
 * 文件业务服务。
 *
 * 落盘布局（DATA_DIR 默认是仓库根目录下的 data/）：
 *   data/files/FILE-0001.txt   -> 元数据 JSON
 *   data/files/index.txt       -> 自增计数器
 *   data/uploads/FILE-0001.png -> 文件二进制本体
 *
 * 元数据与本体分开存：listEntities 只读小文件，不会把图片读进内存。
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  /** 元数据目录 */
  private readonly filesDir: string;

  /** 文件本体目录 */
  private readonly uploadsDir: string;

  constructor(
    private readonly storage: FileStorageService,
    private readonly config: ConfigService,
  ) {
    const dataDir = resolveDataDir(this.config);
    this.filesDir = join(dataDir, 'files');
    this.uploadsDir = join(dataDir, 'uploads');
  }

  /**
   * 保存一个文件：先写本体，再写元数据。
   *
   * 顺序很重要：万一写元数据失败，磁盘上只会多一个孤儿文件（可清理），
   * 反过来则会留下一个指向不存在文件的元数据（对调用方是脏数据）。
   */
  async saveFromBuffer(input: SaveFileInput): Promise<FileMeta> {
    if (!input.content || input.content.length === 0) {
      throw new BadRequestException('文件内容为空');
    }

    const id = await this.storage.nextId(this.filesDir, 'FILE');
    await this.storage.ensureDir(this.uploadsDir);

    const extension = this.safeExtension(input.originalName);
    const storagePath = join(this.uploadsDir, `${id}${extension}`);

    await fs.writeFile(storagePath, input.content);

    const meta: FileMeta = {
      id,
      originalName: input.originalName || `${id}${extension}`,
      mimeType: input.mimeType || 'application/octet-stream',
      size: input.content.length,
      storagePath,
      uploadedBy: input.uploadedBy || 'anonymous',
      createdAt: new Date().toISOString(),
    };

    await this.storage.writeEntity(this.filesDir, id, meta);
    this.logger.log(`文件已保存: ${id} (${meta.size} bytes) -> ${storagePath}`);

    return meta;
  }

  /** 查询元数据，不存在抛 404（异常过滤器会转成 gRPC NOT_FOUND） */
  async findOne(id: string): Promise<FileMeta> {
    const meta = await this.storage.readEntity<FileMeta>(this.filesDir, id);
    if (!meta) {
      throw new NotFoundException(`文件 ${id} 不存在`);
    }
    return meta;
  }

  /** 读取文件本体，供下载接口使用 */
  async readContent(id: string): Promise<{ meta: FileMeta; content: Buffer }> {
    const meta = await this.findOne(id);
    try {
      const content = await fs.readFile(meta.storagePath);
      return { meta, content };
    } catch {
      // 元数据在但文件被删了，属于数据不一致
      throw new NotFoundException(`文件 ${id} 的存储内容已丢失: ${meta.storagePath}`);
    }
  }

  /**
   * 从原始文件名里取一个安全的扩展名。
   * 只保留形如 `.png` / `.tar` 的短扩展名，天然挡掉 `../../evil` 这类路径穿越。
   */
  private safeExtension(originalName: string): string {
    const extension = extname(originalName ?? '').toLowerCase();
    return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '';
  }
}
