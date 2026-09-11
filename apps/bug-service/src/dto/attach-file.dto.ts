import { EmptyStringToUndefined } from '@bug-track/common';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * 对应 bug.proto 的 `AttachFileRequest`（POST /bugs/:bugId/attachments）
 *
 * 注意字段名是 bugId + fileId 两个不同前缀的 ID，
 * 别和单 ID 的 DTO 搞混 —— 这里没有 `id` 字段。
 */
export class AttachFileDto {
  @IsString()
  @IsNotEmpty({ message: 'bugId 不能为空' })
  @Matches(/^BUG-\d+$/, { message: 'bugId 必须形如 BUG-0001' })
  bugId!: string;

  @IsString()
  @IsNotEmpty({ message: 'fileId 不能为空' })
  @Matches(/^FILE-\d+$/, { message: 'fileId 必须形如 FILE-0001' })
  fileId!: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  operator?: string;
}
