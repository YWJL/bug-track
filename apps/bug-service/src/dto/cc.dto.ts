import { EmptyStringToUndefined } from '@bug-track/common';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * 对应 bug.proto 的 `AddCcRequest`（POST /bugs/:id/cc）
 */
export class AddCcDto {
  @IsString()
  @IsNotEmpty({ message: 'id 不能为空' })
  @Matches(/^BUG-\d+$/, { message: 'id 必须形如 BUG-0001' })
  id!: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'users 不能为空数组' })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  users!: string[];

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  operator?: string;
}

/**
 * 对应 bug.proto 的 `RemoveCcRequest`（DELETE /bugs/:id/cc）
 */
export class RemoveCcDto {
  @IsString()
  @IsNotEmpty({ message: 'id 不能为空' })
  @Matches(/^BUG-\d+$/, { message: 'id 必须形如 BUG-0001' })
  id!: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'users 不能为空数组' })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  users!: string[];

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  operator?: string;
}
