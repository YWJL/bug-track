import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type { FileMeta, FileResponse } from '@bug-track/common';
import { GetFileGrpcDto } from './dto/get-file.grpc.dto';
import { UploadFileGrpcDto } from './dto/upload-file.grpc.dto';
import { FileService } from './file.service';

/**
 * file-service 的 gRPC 接口（:5002）。
 *
 * `@GrpcMethod('FileService', 'Xxx')` 的两个参数分别是 proto 里的 service 名和方法名，
 * 必须与 libs/proto/file.proto 完全一致。
 *
 * 返回值的形状也要严格贴合 proto：`UploadFile` / `GetFile` 都返回 `FileResponse { FileMeta file = 1; }`，
 * 所以这里统一包一层 `{ file: ... }`。返回裸 FileMeta 会导致序列化后 file 字段为空。
 */
@Controller()
export class FileGrpcController {
  private readonly logger = new Logger(FileGrpcController.name);

  constructor(private readonly fileService: FileService) {}

  /** 供内部服务调用：接收 base64 解码后的二进制内容 */
  @GrpcMethod('FileService', 'UploadFile')
  async uploadFile(request: UploadFileGrpcDto): Promise<FileResponse> {
    this.logger.log(
      `[gRPC] UploadFile 收到请求: originalName=${request.originalName}, bytes=${request.content?.length ?? 0}`,
    );

    const meta: FileMeta = await this.fileService.saveFromBuffer({
      originalName: request.originalName,
      mimeType: request.mimeType ?? 'application/octet-stream',
      // proto3 bytes 经 proto-loader 解出来就是 Buffer；防御性处理成 Buffer 以防上游换了 loader 配置
      content: Buffer.isBuffer(request.content) ? request.content : Buffer.from(request.content ?? []),
      uploadedBy: request.uploadedBy ?? 'anonymous',
    });

    return { file: meta };
  }

  /** 供内部服务调用：查询文件是否存在 */
  @GrpcMethod('FileService', 'GetFile')
  async getFile(request: GetFileGrpcDto): Promise<FileResponse> {
    this.logger.log(`[gRPC] GetFile 收到请求: id=${request.id}`);

    const meta = await this.fileService.findOne(request.id);

    this.logger.log(`[gRPC] GetFile 命中: ${meta.id} (${meta.originalName})`);
    return { file: meta };
  }
}
