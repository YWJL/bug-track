import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** 路径参数 :id 的校验（HTTP 专用） */
export class IdParamDto {
  @IsString()
  @IsNotEmpty({ message: 'id 不能为空' })
  @Matches(/^BUG-\d+$/, { message: 'id 必须形如 BUG-0001' })
  id!: string;
}
