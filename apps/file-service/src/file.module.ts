import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { DEFAULT_MAX_FILE_SIZE, FileStorageService } from '@bug-track/common';
import { join } from 'path';
import { FileController } from './file.controller';
import { FileGrpcController } from './file.grpc.controller';
import { FileService } from './file.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 两个服务共用一个根 .env。
      // `nest start` 的工作目录是 apps/file-service，
      // 打包后用 `node dist/main.js` 则是 apps/file-service/dist，两种情况都要能找到。
      envFilePath: [join(process.cwd(), '.env'), join(process.cwd(), '../../.env'), join(process.cwd(), '../../../.env')],
    }),

    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // 不显式传 storage：multer 在未指定 storage/dest 时默认就是 MemoryStorage。
        // 这里刻意不 import 'multer'，省掉一个直接依赖（pnpm 的严格 node_modules 下，
        // 未声明的包是解析不到的），效果完全一样：
        // 先把完整 Buffer 收进内存，再决定落盘路径（要用刚分配的 FILE-xxxx 当文件名）。
        limits: {
          fileSize: Number(config.get<string>('MAX_FILE_SIZE', String(DEFAULT_MAX_FILE_SIZE))),
          files: 1,
        },
      }),
    }),
  ],
  controllers: [FileController, FileGrpcController],
  providers: [FileService, FileStorageService],
})
export class FileModule {}
