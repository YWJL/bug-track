import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { Request, Response } from 'express';
import { throwError } from 'rxjs';
import { toGrpcError } from '../grpc/grpc-error.util';
import type { ApiResponse } from '../interfaces/api-response.interface';

/**
 * 全局统一异常过滤器。
 *
 * 两个服务都是 HTTP + gRPC 双栈（hybrid app），同一个过滤器要同时应付两条通道：
 *
 * - HTTP 通道：返回 `{ code, message, data: null }`，HTTP 状态码仍然按语义设置
 * - gRPC 通道：转成 gRPC status + message，让调用方能拿到精确的错误码
 *
 * Nest 会把 `useGlobalFilters()` 注册的过滤器同时应用到 HTTP 和 microservice，
 * 所以这里必须按 `host.getType()` 分支，否则 gRPC 请求会被塞进一个 express Response。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void | ReturnType<typeof throwError> {
    if (host.getType() === 'rpc') {
      return this.handleRpc(exception);
    }
    return this.handleHttp(exception, host);
  }

  /** gRPC 通道：只抛错误，不写响应对象 */
  private handleRpc(exception: unknown): ReturnType<typeof throwError> {
    const { code, message } = toGrpcError(exception);

    if (code === HttpStatus.INTERNAL_SERVER_ERROR) {
      // 非预期异常，把堆栈打出来方便排查
      this.logger.error(`[gRPC] ${message}`, (exception as Error)?.stack);
    } else {
      this.logger.warn(`[gRPC] code=${code} message=${message}`);
    }

    // ⚠️ 这里必须发射**裸 payload 对象**，不能发射 RpcException 实例。
    //
    // @grpc/grpc-js 的 serverErrorToStatus() 判断的是
    //   'code' in error && typeof error.code === 'number' && Number.isInteger(error.code)
    // 而 RpcException 把 payload 挂在 this.error 上，顶层根本没有 code 属性，
    // 于是无论里面写了什么状态码，最后都退化成 `2 UNKNOWN: <message>`。
    //
    // Nest 内置的 BaseRpcExceptionFilter 也正是因此
    // （对 RpcException 取 getError() 后直接 throwError 出那个对象，而不是抛实例）。
    // 我们注册了自定义全局过滤器就绕开了它，所以这条规则得自己遵守。
    return throwError(() => ({ code, message }));
  }

  /** HTTP 通道：统一响应体 */
  private handleHttp(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { httpStatus, message } = this.resolveHttpError(exception);

    if (httpStatus >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[HTTP] ${request.method} ${request.url} -> ${httpStatus} ${message}`,
        (exception as Error)?.stack,
      );
    } else {
      this.logger.warn(`[HTTP] ${request.method} ${request.url} -> ${httpStatus} ${message}`);
    }

    const body: ApiResponse<null> = {
      code: httpStatus,
      message,
      data: null,
    };
    response.status(httpStatus).json(body);
  }

  private resolveHttpError(exception: unknown): { httpStatus: number; message: string } {
    if (exception instanceof HttpException) {
      const httpStatus = exception.getStatus();
      const payload = exception.getResponse();

      let message: string;
      if (typeof payload === 'string') {
        message = payload;
      } else {
        const raw = (payload as { message?: string | string[] }).message;
        // ValidationPipe 会给出 string[]，拼接成一行便于前端展示
        message = Array.isArray(raw) ? raw.join('; ') : (raw ?? exception.message);
      }
      return { httpStatus, message };
    }

    // RpcException 从 HTTP 通道漏出来（比如 controller 里手动抛的），尽力映射
    if (exception instanceof RpcException) {
      const error = exception.getError();
      const code = typeof error === 'object' ? (error as { code?: number }).code : undefined;
      return {
        httpStatus: this.grpcToHttpStatus(code),
        message: typeof error === 'string' ? error : String((error as { message?: string })?.message ?? exception.message),
      };
    }

    return {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      message: (exception as Error)?.message ?? '服务内部错误',
    };
  }

  /** 反向映射，仅在 HTTP 通道上兜底使用 */
  private grpcToHttpStatus(grpcCode?: number): number {
    switch (grpcCode) {
      case 3:
        return HttpStatus.BAD_REQUEST;
      case 5:
        return HttpStatus.NOT_FOUND;
      case 6:
        return HttpStatus.CONFLICT;
      case 7:
        return HttpStatus.FORBIDDEN;
      case 9:
        return HttpStatus.FAILED_DEPENDENCY;
      case 13:
        return HttpStatus.INTERNAL_SERVER_ERROR;
      case 14:
        return HttpStatus.SERVICE_UNAVAILABLE;
      case 4:
        return HttpStatus.REQUEST_TIMEOUT;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
