import { EmptyStringToUndefined } from '@bug-track/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BUG_STATUSES, BugStatus } from '../interfaces/bug.interface';

/**
 * 对应 bug.proto 的 `ListBugsRequest`，也用于 HTTP GET /bugs?status=&assignee=
 *
 * 空串会被 @EmptyStringToUndefined 折叠成 undefined，
 * 表示"这个条件不参与过滤"（gRPC 客户端不传字段时同样是 undefined）。
 */
export class ListBugsDto {
  @EmptyStringToUndefined()
  @IsOptional()
  @IsIn(BUG_STATUSES, { message: `status 必须是 ${BUG_STATUSES.join(' / ')} 之一` })
  status?: BugStatus;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignee?: string;
}
