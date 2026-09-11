/** 注入 gRPC 客户端时使用的 token（bug-service 调用 file-service） */
export const FILE_SERVICE_CLIENT = 'FILE_SERVICE';

/** gRPC 服务包名 */
export const BUG_PACKAGE_NAME = 'bug';
export const FILE_PACKAGE_NAME = 'file';

/** 跨服务 gRPC 调用默认超时（毫秒） */
export const DEFAULT_GRPC_TIMEOUT_MS = 5000;

/** 单个上传文件默认大小上限（10MB） */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** index.txt 文件名（记录自增 ID） */
export const INDEX_FILE_NAME = 'index.txt';

/** 实体文件扩展名 */
export const ENTITY_FILE_EXT = '.txt';
