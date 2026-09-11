import { EmptyStringToUndefined } from '@bug-track/common';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** 对应 bug.proto 的 `AssignBugRequest` */
export class AssignBugDto {
  @IsString()
  @IsNotEmpty({ message: 'id 不能为空' })
  @Matches(/^BUG-\d+$/, { message: 'id 必须形如 BUG-0001' })
  id!: string;

  @IsString()
  @IsNotEmpty({ message: 'assignee 不能为空' })
  @MaxLength(64)
  assignee!: string;

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
