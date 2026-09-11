import { EmptyStringToUndefined } from '@bug-track/common';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { BUG_STATUSES, BugStatus } from '../interfaces/bug.interface';

/**
 * 对应 bug.proto 的 `UpdateBugStatusRequest`。
 *
 * 业务上不做状态机校验（任意流转都允许），但取值范围仍然要卡住，
 * 否则 txt 里会写进 "done" / "已完成" 这种脏数据。
 */
export class UpdateBugStatusDto {
  @IsString()
  @IsNotEmpty({ message: 'id 不能为空' })
  @Matches(/^BUG-\d+$/, { message: 'id 必须形如 BUG-0001' })
  id!: string;

  @IsIn(BUG_STATUSES, { message: `status 必须是 ${BUG_STATUSES.join(' / ')} 之一` })
  status!: BugStatus;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  operator?: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
