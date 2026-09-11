import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmptyStringToUndefined } from '@bug-track/common';

/**
 * 对应 file.proto 的 `UploadFileRequest`。
 *
 * `content` 是 proto3 的 bytes，proto-loader 解出来是 Buffer；
 * class-validator 没有针对 Buffer 的语义化校验，所以这里只挂 @IsOptional()
 * （必须有装饰器，否则 ValidationPipe 的 whitelist 会把字段整个删掉），
 * 非空校验放在 FileService.saveFromBuffer 里做。
 */
export class UploadFileGrpcDto {
  @IsString()
  @IsNotEmpty({ message: 'originalName 不能为空' })
  @MaxLength(255)
  originalName!: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  mimeType?: string;

  @IsOptional()
  content?: Buffer;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uploadedBy?: string;
}
