import { EmptyStringToUndefined } from '@bug-track/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /bugs/:id/attachments/upload 的 multipart 附加字段。
 * 文件本体由 FileInterceptor 从 `file` 字段解析。
 */
export class UploadAttachmentHttpDto {
  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  operator?: string;
}
