import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** 对应 file.proto 的 `GetFileRequest` */
export class GetFileGrpcDto {
  @IsString()
  @IsNotEmpty({ message: 'id 不能为空' })
  @Matches(/^FILE-\d+$/, { message: 'id 必须形如 FILE-0001' })
  id!: string;
}
