import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MulterModule } from '@nestjs/platform-express';
import {
  DEFAULT_MAX_FILE_SIZE,
  FILE_SERVICE_CLIENT,
  FILE_PACKAGE_NAME,
  FileStorageService,
} from '@bug-track/common';
import { FILE_PROTO_PATH } from '@bug-track/proto';
import { join } from 'path';
import { BugController } from './bug.controller';
import { BugGrpcController } from './bug.grpc.controller';
import { BugService } from './bug.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '.env'),
        join(process.cwd(), '../../.env'),
        join(process.cwd(), '../../../.env'),
      ],
    }),

    // ═══════════════════════════════════════════════════════════════════════
    // 跨微服务 gRPC 客户端配置
    //
    // registerAsync 而不是 register：gRPC 地址要能从 .env 读，
    // 而 .env 只有在 ConfigModule 起来之后才可用。
    // ═══════════════════════════════════════════════════════════════════════
    ClientsModule.registerAsync([
      {
        // 注入到 BugService 用的 token：@Inject(FILE_SERVICE_CLIENT)
        name: FILE_SERVICE_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            // 必须与 libs/proto/file.proto 里的 `package file;` 一致
            package: FILE_PACKAGE_NAME,
            // proto 文件的绝对路径，由 @bug-track/proto 提供
            protoPath: FILE_PROTO_PATH,
            // 目标地址。注意这里是「客户端连过去」的地址，
            // 容器里要写 file-service:5002，本机开发写 localhost:5002
            url: config.get<string>('FILE_SERVICE_GRPC_URL', 'localhost:5002'),
            // 必须与服务端保持一致的 loader 配置，否则字段名/类型会对不上
            loader: {
              keepCase: false,
              longs: Number,
              enums: String,
              defaults: false,
              oneofs: true,
            },
          },
        }),
      },
    ]),

    // bug-service 自己也不落文件，但 HTTP 上传接口要先把 multipart 收进内存，
    // 再通过 gRPC 把 Buffer 转给 file-service
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // multer 默认即 MemoryStorage，不显式传 storage 可以少一个直接依赖
        limits: {
          fileSize: Number(config.get<string>('MAX_FILE_SIZE', String(DEFAULT_MAX_FILE_SIZE))),
          files: 1,
        },
      }),
    }),
  ],
  controllers: [
    BugController, // HTTP :3001
    BugGrpcController, // gRPC :5001
  ],
  providers: [
    BugService,
    // FileStorageService 是无状态的（目录按调用传入），直接当普通 provider 用
    FileStorageService,
  ],
})
export class BugModule {}
