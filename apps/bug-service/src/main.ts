import 'reflect-metadata';
import { bootstrapHybridApp } from '@bug-track/common';
import { BUG_PROTO_PATH } from '@bug-track/proto';
import { BugModule } from './bug.module';

/**
 * bug-service 入口：HTTP :3001 + gRPC :5001
 */
void bootstrapHybridApp(BugModule, {
  serviceName: 'bug-service',
  packageName: 'bug',
  protoPath: BUG_PROTO_PATH,
  httpPortKey: 'BUG_HTTP_PORT',
  httpPortDefault: 3001,
  grpcUrlKey: 'BUG_GRPC_URL',
  grpcUrlDefault: '0.0.0.0:5001',
});
