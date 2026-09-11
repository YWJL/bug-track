import { Transform } from 'class-transformer';

/**
 * 把空串归一化成 undefined。
 *
 * 背景：gRPC 客户端在 proto3 下省略 string 字段时，视 loader 配置可能传成 ''。
 * 如果直接交给 @IsOptional()，空串会被当成"有值"，后续 @IsEnum / @IsIn 就会误报。
 * 用这个装饰器把 '' 折叠成 undefined，让 @IsOptional() 语义正确。
 *
 * 必须配合 ValidationPipe 的 `transform: true` 使用。
 */
export function EmptyStringToUndefined(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));
}
