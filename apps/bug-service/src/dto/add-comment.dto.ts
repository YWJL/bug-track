import { EmptyStringToUndefined } from '@bug-track/common';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * 添加评论。
 *
 * 这是 HTTP 独有的接口 —— bug.proto 里没有留 AddComment 的 rpc，
 * 所以 gRPC 侧暂时无法添加评论（history 的 action='comment' 仍然会被写入 txt）。
 */
export class AddCommentDto {
  @IsString()
  @IsNotEmpty({ message: 'id 不能为空' })
  @Matches(/^BUG-\d+$/, { message: 'id 必须形如 BUG-0001' })
  id!: string;

  @IsString()
  @IsNotEmpty({ message: 'content 不能为空' })
  @MaxLength(2000, { message: 'content 最长 2000 字符' })
  content!: string;

  @EmptyStringToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  operator?: string;
}
