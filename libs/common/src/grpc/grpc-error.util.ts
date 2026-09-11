import { HttpException, HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ServiceError, status as GrpcStatus } from '@grpc/grpc-js';
import { TimeoutError } from 'rxjs';

/** gRPC 标准错误结构 */
export interface GrpcErrorPayload {
  code: number;
  message: string;
}

/**
 * HTTP 状态码 → gRPC 状态码。
 *
 * 为什么需要这张表？
 * 业务代码里习惯抛 HttpException（NotFoundException / BadRequestException ...），
 * 但在 gRPC 通道上必须转成 gRPC status，否则调用方只会看到一个笼统的 UNKNOWN。
 */
const HTTP_TO_GRPC: Readonly<Record<number, number>> = {
  [HttpStatus.BAD_REQUEST]: GrpcStatus.INVALID_ARGUMENT,
  [HttpStatus.UNAUTHORIZED]: GrpcStatus.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: GrpcStatus.PERMISSION_DENIED,
  [HttpStatus.NOT_FOUND]: GrpcStatus.NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: GrpcStatus.UNIMPLEMENTED,
  [HttpStatus.NOT_ACCEPTABLE]: GrpcStatus.INVALID_ARGUMENT,
  [HttpStatus.REQUEST_TIMEOUT]: GrpcStatus.DEADLINE_EXCEEDED,
  [HttpStatus.CONFLICT]: GrpcStatus.ALREADY_EXISTS,
  [HttpStatus.GONE]: GrpcStatus.NOT_FOUND,
  [HttpStatus.PRECONDITION_FAILED]: GrpcStatus.FAILED_PRECONDITION,
  [HttpStatus.PAYLOAD_TOO_LARGE]: GrpcStatus.RESOURCE_EXHAUSTED,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: GrpcStatus.INVALID_ARGUMENT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: GrpcStatus.FAILED_PRECONDITION,
  [HttpStatus.TOO_MANY_REQUESTS]: GrpcStatus.RESOURCE_EXHAUSTED,
  [HttpStatus.INTERNAL_SERVER_ERROR]: GrpcStatus.INTERNAL,
  [HttpStatus.NOT_IMPLEMENTED]: GrpcStatus.UNIMPLEMENTED,
  [HttpStatus.BAD_GATEWAY]: GrpcStatus.UNAVAILABLE,
  [HttpStatus.SERVICE_UNAVAILABLE]: GrpcStatus.UNAVAILABLE,
  [HttpStatus.GATEWAY_TIMEOUT]: GrpcStatus.DEADLINE_EXCEEDED,
  [HttpStatus.HTTP_VERSION_NOT_SUPPORTED]: GrpcStatus.UNIMPLEMENTED,
};

/** 从 HttpException 的 response 里掏出可读的 message */
function extractHttpMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const message = (response as { message?: string | string[] }).message;
  if (Array.isArray(message)) {
    return message.join('; ');
  }
  return message ?? exception.message;
}

/**
 * 服务端：把任意异常规整成 gRPC 错误载荷。
 * 供 gRPC 通道上的全局异常过滤器使用。
 */
export function toGrpcError(exception: unknown): GrpcErrorPayload {
  // RpcException 已经是 gRPC 语义了，直接取出 code/message
  if (exception instanceof RpcException) {
    const error = exception.getError();
    if (typeof error === 'string') {
      return { code: GrpcStatus.UNKNOWN, message: error };
    }
    const payload = error as { code?: number; message?: string | string[] };
    const message = Array.isArray(payload.message)
      ? payload.message.join('; ')
      : String(payload.message ?? exception.message);
    return {
      code: typeof payload.code === 'number' ? payload.code : GrpcStatus.UNKNOWN,
      message,
    };
  }

  if (exception instanceof HttpException) {
    const httpStatus = exception.getStatus();
    return {
      code: HTTP_TO_GRPC[httpStatus] ?? GrpcStatus.UNKNOWN,
      message: extractHttpMessage(exception),
    };
  }

  const fallback = exception as Error;
  return {
    code: GrpcStatus.INTERNAL,
    message: fallback?.message ?? '服务内部错误',
  };
}

/**
 * 客户端：把调用下游服务时拿到的错误，转成本服务的 RpcException。
 *
 * 这里的关键是**透传下游的 gRPC status**：
 * file-service 返回 NOT_FOUND(5)，bug-service 就应该原样往上抛 NOT_FOUND(5)，
 * 而不是包装成 INTERNAL，否则调用方无法区分"文件不存在"和"文件服务挂了"。
 */
export function mapServiceErrorToRpcException(error: unknown, fallbackMessage: string): RpcException {
  // 下游返回的 gRPC 错误
  const serviceError = error as ServiceError;
  if (serviceError && typeof serviceError.code === 'number') {
    return new RpcException({
      code: serviceError.code,
      message: serviceError.details || serviceError.message || fallbackMessage,
    });
  }

  // 我们自己加的 timeout() 运算符触发
  if (error instanceof TimeoutError) {
    return new RpcException({
      code: GrpcStatus.DEADLINE_EXCEEDED,
      message: `${fallbackMessage}（调用超时）`,
    });
  }

  // 连不上 / 网络错误
  const message = (error as Error)?.message ?? '未知错误';
  return new RpcException({
    code: GrpcStatus.UNAVAILABLE,
    message: `${fallbackMessage}: ${message}`,
  });
}
