import type { FileResponse } from '@bug-track/common';
import type { Observable } from 'rxjs';

/**
 * file-service 的 gRPC 契约在 TS 侧的投影。
 *
 * `ClientGrpc.getService<T>()` 是个纯类型断言，运行时不做任何校验，
 * 所以这个接口必须和 libs/proto/file.proto 里的 FileService 手工保持一致 ——
 * 方法名、入参形状、返回类型任一不匹配，都要等到运行时才炸。
 */
export interface FileServiceClient {
  /** 对应 rpc UploadFile (UploadFileRequest) returns (FileResponse) */
  uploadFile(request: {
    originalName: string;
    mimeType: string;
    content: Buffer;
    uploadedBy: string;
  }): Observable<FileResponse>;

  /** 对应 rpc GetFile (GetFileRequest) returns (FileResponse) */
  getFile(request: { id: string }): Observable<FileResponse>;
}
