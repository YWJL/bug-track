import { EmptyStringToUndefined } from '@bug-track/common';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { BUG_SEVERITIES, BugSeverity } from '../interfaces/bug.interface';

/**
 * 对应 bug.proto 的 `CreateBugRequest`。
 * HTTP POST /bugs 与 gRPC CreateBug 共用同一个 DTO。
 */
export class CreateBugDto {
  @IsString()
  @IsNotEmpty({ message: 'title 不能为空' })
  @MaxLength(200, { message: 'title 最长 200 字符' })
  title!: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsEnum(BUG_SEVERITIES, { message: `severity 必须是 ${BUG_SEVERITIES.join(' / ')} 之一` })
  severity?: BugSeverity;

  @IsString()
  @IsNotEmpty({ message: 'creator 不能为空' })
  @MaxLength(64)
  creator!: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: 'assignee 最长 64 字符' })
  assignee?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ccList?: string[];
}
