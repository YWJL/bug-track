import { existsSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { ConfigService } from '@nestjs/config';

/** 用于识别仓库根目录的标记文件 */
const ROOT_MARKERS = ['pnpm-workspace.yaml', 'pnpm-lock.yaml'];

/**
 * 从 startDir 向上查找仓库根目录。
 *
 * 为什么要这么麻烦？
 * `nest start --watch` 的工作目录是 apps/bug-service，
 * 而 `node dist/main.js` 的工作目录是 apps/bug-service/dist，
 * 同一个 `DATA_DIR=./data` 在两处会解析到不同位置。
 * 统一向上找到含 pnpm-workspace.yaml 的目录，保证两个服务读写的是同一个 data/。
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let current = resolve(startDir);

  for (let depth = 0; depth < 8; depth += 1) {
    if (ROOT_MARKERS.some((marker) => existsSync(join(current, marker)))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break; // 已经到盘符根目录
    }
    current = parent;
  }

  // 找不到就退回起始目录，至少行为可预测
  return resolve(startDir);
}

/** 把相对路径按仓库根目录解析成绝对路径；绝对路径原样返回 */
export function resolveFromRoot(target: string, startDir: string = process.cwd()): string {
  return isAbsolute(target) ? target : resolve(findProjectRoot(startDir), target);
}

/**
 * 从配置中读取数据根目录（默认 ./data）。
 * 解析规则见 resolveFromRoot。
 */
export function resolveDataDir(config: ConfigService, key = 'DATA_DIR', fallback = './data'): string {
  return resolveFromRoot(config.get<string>(key) ?? fallback);
}
