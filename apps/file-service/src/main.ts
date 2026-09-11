import 'reflect-metadata';
import { bootstrapHybridApp } from '@bug-track/common';
import { FILE_PROTO_PATH } from '@bug-track/proto';
import { FileModule } from './file.module';

/**
 * file-service 入口：HTTP :3002 + gRPC :5002
 */
void bootstrapHybridApp(FileModule, {
  serviceName: 'file-service',
  packageName: 'file',
  protoPath: FILE_PROTO_PATH,
  httpPortKey: 'FILE_HTTP_PORT',
  httpPortDefault: 3002,
  grpcUrlKey: 'FILE_GRPC_URL',
  grpcUrlDefault: '0.0.0.0:5002',
});
