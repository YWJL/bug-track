import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import type { Type } from '@nestjs/common';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';
import { TransformInterceptor } from '../interceptors/transform.interceptor';

/** 双栈服务（HTTP + gRPC）的启动参数 */
export interface HybridAppOptions {
  /** 服务名，仅用于日志 */
  serviceName: string;
  /** proto 里的 package 名，如 'bug' / 'file' */
  packageName: string;
  /** .proto 文件绝对路径 */
  protoPath: string | string[];
  /** HTTP 端口的环境变量名 */
  httpPortKey: string;
  httpPortDefault: number;
  /** gRPC 监听地址的环境变量名，形如 0.0.0.0:5001 */
  grpcUrlKey: string;
  grpcUrlDefault: string;
}

/**
 * 启动一个 HTTP + gRPC 双栈的 Nest 应用。
 *
 * 用 `connectMicroservice` 而不是 `NestFactory.createMicroservice`：
 * 后者会为同一个模块再建一个 IOC 容器，导致 provider 被实例化两次
 * （FileStorageService 的内存队列、gRPC 客户端连接都会重复）。
 * connectMicroservice 复用同一个容器，控制器里的 @GrpcMethod 和 HTTP 路由共享同一批单例。
 */
export async function bootstrapHybridApp(
  rootModule: Type<unknown>,
  options: HybridAppOptions,
): Promise<void> {
  const logger = new Logger(options.serviceName);
  const app = await NestFactory.create(rootModule);

  const config = app.get(ConfigService);
  const httpPort = Number(config.get<string>(options.httpPortKey, String(options.httpPortDefault)));
  const grpcUrl = config.get<string>(options.grpcUrlKey, options.grpcUrlDefault);

  // 入参校验：HTTP query / body 与 gRPC message 都会走这个管道
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // 让 class-transformer 生效（@Transform / 类型转换）
      whitelist: true, // 剔除 DTO 未声明的字段
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // hybrid app 下 useGlobalFilters 会同时作用于 HTTP 与 gRPC 两条通道，
  // 过滤器内部按 host.getType() 分支处理
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  app.enableCors();

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.GRPC,
      options: {
        package: options.packageName,
        protoPath: options.protoPath,
        url: grpcUrl,
        loader: {
          keepCase: false, // proto 里的 camelCase 字段保持原样
          longs: Number, // int64 转成 number（文件大小等场景足够）
          enums: String, // enum 以字符串传输
          defaults: false, // 未设置的字段保持 undefined，避免空串干扰校验
          oneofs: true,
        },
      },
    },
    {
      // ⚠️ 这一行不能省。
      //
      // connectMicroservice 默认会为 microservice **新建一个 ApplicationConfig**
      // （见 @nestjs/core 的 nest-application.js：inheritAppConfig 为假时 new ApplicationConfig()）。
      // 那样上面注册的 ValidationPipe / AllExceptionsFilter / TransformInterceptor
      // 只会落在 HTTP 那份 config 上，gRPC 通道完全拿不到 ——
      // 表现就是 gRPC 侧的 HttpException 不会被转成对应的 gRPC status，
      // 一律以 "2 UNKNOWN: Internal server error" 返回，且入参校验静默失效。
      //
      // 打开 inheritedAppConfig 后两条通道共用同一份配置，行为才一致。
      inheritAppConfig: true,
    },
  );

  await app.startAllMicroservices();
  await app.listen(httpPort, '0.0.0.0');

  logger.log(`HTTP 已启动   : http://localhost:${httpPort}`);
  logger.log(`gRPC 已启动   : ${grpcUrl} (package: ${options.packageName})`);
  logger.log(`proto 文件    : ${Array.isArray(options.protoPath) ? options.protoPath.join(', ') : options.protoPath}`);
}
