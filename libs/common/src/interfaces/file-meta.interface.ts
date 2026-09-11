/**
 * 文件元数据。
 *
 * 与 libs/proto/file.proto 里的 `FileMeta` 一一对应，
 * 放在 common 里是为了让 file-service（产出方）和 bug-service（消费方）
 * 共用同一个 TS 类型，避免两边各写一份慢慢漂移。
 *
 * 注意：proto 里 `size` 是 int64；因为启动时配了 `loader.longs = Number`，
 * 到了 TS 侧就是普通的 number。
 */
export interface FileMeta {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
}

/** gRPC `FileResponse` 的 TS 形态（字段未设置时 file 为 undefined） */
export interface FileResponse {
  file?: FileMeta;
}
