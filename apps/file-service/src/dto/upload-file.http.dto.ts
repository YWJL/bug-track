import { IsOptional, IsString, MaxLength } from 'class-validator';
import { EmptyStringToUndefined } from '@bug-track/common';

/**
 * HTTP multipart 上传时的表单附加字段。
 * 文件本体由 FileInterceptor 从 `file` 字段解析，不在这里。
 */
export class UploadFileHttpDto {
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uploadedBy?: string;
}
