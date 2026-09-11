import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** 对应 bug.proto 的 `GetBugRequest`，也用于 HTTP 的 :id 路径参数 */
export class GetBugDto {
  @IsString()
  @IsNotEmpty({ message: 'id 不能为空' })
  @Matches(/^BUG-\d+$/, { message: 'id 必须形如 BUG-0001' })
  id!: string;
}
