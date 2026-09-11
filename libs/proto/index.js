'use strict';

/**
 * @bug-track/proto
 *
 * 只做一件事：把 .proto 文件的**绝对路径**暴露给各个微服务。
 *
 * 为什么需要它？
 * @nestjs/microservices 的 Transport.GRPC 需要 protoPath 指向磁盘上的真实文件。
 * 各服务的 `nest start` / `node dist/main.js` 工作目录不同（apps/xxx 与 apps/xxx/dist），
 * 用相对路径一定会在某个场景下解析失败。这里用 __dirname 一次性算好绝对路径，
 * 业务代码只写 `protoPath: FILE_PROTO_PATH` 即可。
 *
 * 注意：包目录被 pnpm 以 symlink 形式挂到 node_modules 下，
 * Node 默认解析真实路径（preserveSymlinks=false），所以 __dirname 指向 libs/proto 本体，
 * .proto 文件确实就在这个目录里。
 */

const { join } = require('path');

/** bug-service 的 gRPC 契约文件绝对路径 */
const BUG_PROTO_PATH = join(__dirname, 'bug.proto');

/** file-service 的 gRPC 契约文件绝对路径 */
const FILE_PROTO_PATH = join(__dirname, 'file.proto');

module.exports = {
  BUG_PROTO_PATH,
  FILE_PROTO_PATH,
};
