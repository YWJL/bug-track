import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { ApiResponse } from '../interfaces/api-response.interface';

/**
 * HTTP 响应统一包装成 `{ code, message, data }`。
 *
 * 只对 HTTP 生效：gRPC 的返回值必须保持成 proto 定义的原样对象，
 * 多包一层 `{ code, message, data }` 会导致 proto-loader 序列化时报字段不匹配。
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'success',
        data: data === undefined ? null : data,
      })),
    );
  }
}
