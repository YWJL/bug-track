# bug-track — 简化版禅道 Bug 管理系统（NestJS + gRPC 微服务）

用 txt 文件持久化的微服务后端框架。两个平级微服务，各自同时暴露 HTTP 与 gRPC，
`bug-service` 通过 gRPC 调用 `file-service` 完成文件上传与校验。

- **不依赖数据库**：一个实体一个 `.txt`，内容是格式化 JSON
- **双栈**：每个服务既是 HTTP 服务也是 gRPC 服务（hybrid app），HTTP 便于人工调试，gRPC 用于服务间调用
- **文件上传不落在 bug-service**：`bug-service` 只把 Buffer 通过 gRPC 转给 `file-service`，自己只存 `FILE-xxxx` 引用

---

## 1. 目录结构

```
bug-track/
├── package.json                    # 根脚本：start:bug / start:file / dev / build
├── pnpm-workspace.yaml             # workspace: apps/* libs/*
├── tsconfig.base.json              # TS strict 基础配置，各包 extends
├── .env / .env.example             # 端口、gRPC 地址、数据目录
│
├── libs/
│   ├── proto/                      # 共享 gRPC 契约（纯静态包，无需构建）
│   │   ├── bug.proto
│   │   ├── file.proto
│   │   ├── index.js                # 导出两个 .proto 的**绝对路径**
│   │   └── index.d.ts
│   │
│   └── common/                     # @bug-track/common（tsc 编译成 dist）
│       └── src/
│           ├── index.ts                        # barrel 导出
│           ├── constants.ts                    # token 名、包名、默认超时/大小
│           ├── bootstrap/
│           │   └── bootstrap-hybrid-app.ts     # ★ HTTP + gRPC 双栈启动器
│           ├── storage/
│           │   └── file-storage.service.ts     # ★ txt 持久化 + 写串行队列
│           ├── filters/
│           │   └── all-exceptions.filter.ts    # ★ 统一异常（HTTP / gRPC 双通道）
│           ├── interceptors/
│           │   └── transform.interceptor.ts    # HTTP 统一响应 {code,message,data}
│           ├── grpc/
│           │   └── grpc-error.util.ts          # ★ gRPC 错误码双向映射
│           ├── dto/
│           │   └── empty-string.transform.ts   # 空串 → undefined
│           ├── interfaces/
│           │   ├── api-response.interface.ts
│           │   └── file-meta.interface.ts      # 与 file.proto 的 FileMeta 对齐
│           └── utils/
│               └── path.util.ts                # 向上找仓库根，解析 DATA_DIR
│
├── apps/
│   ├── bug-service/                # HTTP :3001  gRPC :5001
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── bug.module.ts                   # ★ ClientsModule.registerAsync 配 gRPC 客户端
│   │       ├── bug.service.ts                  # ★ 业务 + 跨服务 gRPC 调用
│   │       ├── bug.controller.ts               # HTTP 路由
│   │       ├── bug.grpc.controller.ts          # @GrpcMethod 路由
│   │       ├── dto/                            # class-validator DTO
│   │       │   ├── create-bug.dto.ts
│   │       │   ├── get-bug.dto.ts
│   │       │   ├── list-bugs.dto.ts
│   │       │   ├── update-bug-status.dto.ts
│   │       │   ├── assign-bug.dto.ts
│   │       │   ├── cc.dto.ts
│   │       │   ├── attach-file.dto.ts
│   │       │   ├── add-comment.dto.ts
│   │       │   ├── id-param.dto.ts
│   │       │   └── upload-attachment.dto.ts
│   │       └── interfaces/
│   │           ├── bug.interface.ts            # Bug 实体 + 枚举 + HistoryItem
│   │           └── file-service-client.interface.ts  # file-service 的 TS 契约投影
│   │
│   └── file-service/               # HTTP :3002  gRPC :5002
│       ├── nest-cli.json
│       ├── tsconfig.json
│       └── src/
│           ├── main.ts
│           ├── file.module.ts
│           ├── file.service.ts                 # 落盘 + 元数据
│           ├── file.controller.ts              # multipart 上传 / 查询 / 下载
│           ├── file.grpc.controller.ts         # UploadFile / GetFile
│           └── dto/
│               ├── upload-file.grpc.dto.ts
│               ├── get-file.grpc.dto.ts
│               └── upload-file.http.dto.ts
│
└── data/                           # 运行时生成（已 gitignore）
    ├── bugs/BUG-0001.txt           # Bug 实体
    ├── bugs/index.txt              # 自增计数器
    ├── files/FILE-0001.txt         # 文件元数据
    ├── files/index.txt
    └── uploads/FILE-0001.png       # 文件本体
```

---

## 2. 启动

```bash
# 依赖（仓库要求 pnpm）
npm i -g pnpm        # 或用 corepack enable pnpm
pnpm install

# 准备环境变量
cp .env.example .env

# 方式一：一条命令起两个服务（带 --watch 热重载）
pnpm dev

# 方式二：分别起（各开一个终端）
pnpm start:file      # HTTP :3002  gRPC :5002
pnpm start:bug       # HTTP :3001  gRPC :5001
```

生产模式：

```bash
pnpm build
pnpm --filter @bug-track/file-service start:prod
pnpm --filter @bug-track/bug-service  start:prod
```

清空数据重来：`pnpm clean`

> `start:bug` / `start:file` 会先编译 `@bug-track/common`，因为两个服务通过 pnpm symlink 消费它的 `dist/`。
> 改完 `libs/common` 的代码需要重新 `pnpm build:common`（`pnpm dev` 已包含）。

---

## 3. HTTP 接口

### bug-service（:3001）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/bugs` | 创建 Bug |
| GET | `/bugs/:id` | 查询单个 |
| GET | `/bugs?status=&assignee=` | 列表，两个条件都可选 |
| PATCH | `/bugs/:id/status` | 状态流转（任意流转都允许） |
| PATCH | `/bugs/:id/assign` | 指派 / 转派 |
| POST | `/bugs/:id/cc` | 添加抄送人 |
| DELETE | `/bugs/:id/cc` | 移除抄送人 |
| POST | `/bugs/:id/attachments` | 附加一个已存在的 fileId（gRPC 校验存在性） |
| POST | `/bugs/:id/attachments/upload` | multipart 上传，本体经 gRPC 转交 file-service |
| POST | `/bugs/:id/comments` | 追加评论（HTTP 独有） |

### file-service（:3002）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/files` | multipart 上传，字段名固定 `file` |
| GET | `/files/:id` | 查询元数据 |
| GET | `/files/:id/raw` | 下载本体（规格外补充，便于确认文件真的落盘了） |

### gRPC

| 服务 | 地址 | Package | rpc |
|---|---|---|---|
| bug-service | :5001 | `bug` | CreateBug / GetBug / ListBugs / UpdateBugStatus / AssignBug / AddCc / RemoveCc / AttachFile |
| file-service | :5002 | `file` | UploadFile / GetFile |

---

## 4. 完整调用链路

> 以下命令在仓库根目录执行。Windows 用户注意：`curl` 请用相对路径（原生 curl 不认 MSYS 的 `/tmp/...`）。

### 4.1 创建 Bug

```bash
curl -X POST http://localhost:3001/bugs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "登录页点击无响应",
    "description": "Chrome 下点击登录按钮无任何反应",
    "severity": "critical",
    "creator": "zhangsan",
    "assignee": "lisi",
    "ccList": ["wangwu"]
  }'
```

响应（统一格式 `{code, message, data}`，`code=0` 表示成功）：

```json
{"code":0,"message":"success","data":{"id":"BUG-0001","status":"active", ...}}
```

等价的 gRPC 调用：

```bash
grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"title":"登录页点击无响应","description":"Chrome 下无反应","severity":"critical","creator":"zhangsan","assignee":"lisi","ccList":["wangwu"]}' \
  localhost:5001 bug.BugService/CreateBug
```

### 4.2 上传文件

直连 file-service（人工调试用）：

```bash
curl -X POST http://localhost:3002/files \
  -F "file=@screenshot.png;type=image/png" \
  -F "uploadedBy=zhangsan"
# -> {"code":0,...,"data":{"id":"FILE-0001","storagePath":".../data/uploads/FILE-0001.png"}}
```

等价的 gRPC 调用（`content` 是 bytes，grpcurl 用 base64）：

```bash
grpcurl -plaintext -import-path libs/proto -proto file.proto \
  -d '{"originalName":"screenshot.png","mimeType":"image/png","content":"UE5HLUJZVEVT","uploadedBy":"zhangsan"}' \
  localhost:5002 file.FileService/UploadFile
```

也可以让 bug-service 代传（文件本体走 gRPC，bug-service 自己不落盘）：

```bash
curl -X POST http://localhost:3001/bugs/BUG-0001/attachments/upload \
  -F "file=@screenshot.png;type=image/png" \
  -F "operator=zhangsan"
```

### 4.3 附加附件 —— 触发跨服务 gRPC 调用

```bash
curl -X POST http://localhost:3001/bugs/BUG-0001/attachments \
  -H "Content-Type: application/json" \
  -d '{"fileId":"FILE-0001","operator":"zhangsan"}'
```

这一条会触发 **外部 → bug-service(:5001) → file-service(:5002)** 的二级调用。
bug-service 日志：

```
[BugService] [gRPC →] file-service FileService.GetFile 请求: {"id":"FILE-0001"}
[BugService] [gRPC ←] file-service GetFile 响应(5ms): {"file":{"id":"FILE-0001",...}}
[BugService] 附加附件完成: FILE-0001 -> BUG-0001，本轮跨服务 gRPC 耗时 6ms
```

file-service 日志：

```
[FileGrpcController] [gRPC] GetFile 收到请求: id=FILE-0001
[FileGrpcController] [gRPC] GetFile 命中: FILE-0001 (screenshot.png)
```

等价的 gRPC 调用：

```bash
grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"bugId":"BUG-0001","fileId":"FILE-0001","operator":"zhangsan"}' \
  localhost:5001 bug.BugService/AttachFile
```

**错误透传验证** —— 传一个不存在的 fileId：

```bash
# HTTP
curl -X POST http://localhost:3001/bugs/BUG-0001/attachments \
  -H "Content-Type: application/json" -d '{"fileId":"FILE-9999"}'
# -> {"code":404,"message":"文件 FILE-9999 不存在","data":null}   HTTP 404

# gRPC
grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"bugId":"BUG-0001","fileId":"FILE-9999"}' \
  localhost:5001 bug.BugService/AttachFile
# -> ERROR: Code: NotFound  Message: 文件 FILE-9999 不存在
```

file-service 的 `NOT_FOUND(5)` 被 bug-service 原样向上透传，没有被糊成 `INTERNAL`。

### 4.4 指派

```bash
curl -X PATCH http://localhost:3001/bugs/BUG-0001/assign \
  -H "Content-Type: application/json" \
  -d '{"assignee":"zhaoliu","operator":"lisi","remark":"这不是我负责的模块"}'

grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"id":"BUG-0001","assignee":"zhaoliu","operator":"lisi","remark":"转派"}' \
  localhost:5001 bug.BugService/AssignBug
```

### 4.5 抄送 / 移除抄送

```bash
curl -X POST http://localhost:3001/bugs/BUG-0001/cc \
  -H "Content-Type: application/json" \
  -d '{"users":["sunqi"],"operator":"zhangsan"}'

curl -X DELETE http://localhost:3001/bugs/BUG-0001/cc \
  -H "Content-Type: application/json" \
  -d '{"users":["wangwu"],"operator":"zhangsan"}'

grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"id":"BUG-0001","users":["sunqi"],"operator":"zhangsan"}' \
  localhost:5001 bug.BugService/AddCc

grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"id":"BUG-0001","users":["wangwu"],"operator":"zhangsan"}' \
  localhost:5001 bug.BugService/RemoveCc
```

### 4.6 状态流转（任意流转都允许）

```bash
curl -X PATCH http://localhost:3001/bugs/BUG-0001/status \
  -H "Content-Type: application/json" \
  -d '{"status":"confirmed","operator":"lisi","remark":"已复现"}'

grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"id":"BUG-0001","status":"resolved","operator":"zhaoliu","remark":"已修复"}' \
  localhost:5001 bug.BugService/UpdateBugStatus
```

### 4.7 查询

```bash
curl http://localhost:3001/bugs/BUG-0001
curl "http://localhost:3001/bugs?status=confirmed"
curl "http://localhost:3001/bugs?assignee=lisi"

grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"id":"BUG-0001"}' localhost:5001 bug.BugService/GetBug

grpcurl -plaintext -import-path libs/proto -proto bug.proto \
  -d '{"status":"active"}' localhost:5001 bug.BugService/ListBugs
```

### 4.8 最终产物

`data/bugs/BUG-0001.txt` 里的 `history` 会是这样：

```
create         |              -> active       | zhangsan | 创建 Bug，指派给 lisi
attach         |              -> FILE-0001    | zhangsan | 附加附件 screenshot.png (25 bytes)
assign         | lisi         -> zhaoliu      | lisi     | 这不是我负责的模块
cc             | wangwu       -> wangwu,sunqi | zhangsan | 新增抄送: sunqi
cc             | wangwu,sunqi -> sunqi        | zhangsan | 移除抄送: wangwu
update_status  | active       -> confirmed    | lisi     | 已复现
update_status  | confirmed    -> resolved     | zhaoliu  | 已修复
comment        |              ->              | sunqi    | qa verified on staging
```

---

## 5. 跨微服务 gRPC 调用：三处关键代码

### 5.1 客户端注册 —— `apps/bug-service/src/bug.module.ts`

```ts
ClientsModule.registerAsync([
  {
    name: FILE_SERVICE_CLIENT,                       // 'FILE_SERVICE'
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      transport: Transport.GRPC,
      options: {
        package: FILE_PACKAGE_NAME,                  // 'file'，须与 file.proto 的 package 一致
        protoPath: FILE_PROTO_PATH,                  // @bug-track/proto 导出的绝对路径
        url: config.get('FILE_SERVICE_GRPC_URL', 'localhost:5002'),
        loader: { keepCase: false, longs: Number, enums: String, defaults: false, oneofs: true },
      },
    }),
  },
]),
```

用 `registerAsync` 而不是 `register`，因为地址要读 `.env`，而 `.env` 得等 `ConfigModule` 起来之后才可用。

### 5.2 获取代理 —— `apps/bug-service/src/bug.service.ts`

```ts
@Injectable()
export class BugService implements OnModuleInit {
  private fileService!: FileServiceClient;

  constructor(@Inject(FILE_SERVICE_CLIENT) private readonly fileClient: ClientGrpc) {}

  onModuleInit(): void {
    // ClientGrpc 在模块初始化完成前只是个壳，这里才拿得到真正的方法代理
    this.fileService = this.fileClient.getService<FileServiceClient>('FileService');
  }
}
```

`getService<T>()` 是纯类型断言，运行时不做校验，所以
`interfaces/file-service-client.interface.ts` 必须和 `file.proto` 手工保持一致。

### 5.3 调用 + 错误映射

```ts
private async fetchFileMetaFromFileService(fileId: string): Promise<FileMeta> {
  this.logger.log(`[gRPC →] file-service FileService.GetFile 请求: ${JSON.stringify({ id: fileId })}`);
  const startedAt = Date.now();

  let response: FileResponse;
  try {
    response = await firstValueFrom(
      this.fileService.getFile({ id: fileId }).pipe(timeout(this.grpcTimeoutMs)),
    );
  } catch (error) {
    this.logger.error(`[gRPC ←] file-service GetFile 调用失败(${Date.now() - startedAt}ms): ${(error as Error)?.message}`);
    // 把下游的 gRPC status 原样透传，宁可让调用方看到 NOT_FOUND 也不要糊成 INTERNAL
    throw mapServiceErrorToRpcException(error, `调用 file-service 校验文件 ${fileId} 失败`);
  }

  this.logger.log(`[gRPC ←] file-service GetFile 响应(${Date.now() - startedAt}ms): ${JSON.stringify(response)}`);

  const file = response?.file;
  if (!file?.id) {
    throw new RpcException({ code: GrpcStatus.NOT_FOUND, message: `文件 ${fileId} 不存在` });
  }
  return file;
}
```

`attachFile` 随后读 Bug → push fileId → 写 `history(action='attach')` → 落盘。

### 5.4 服务端 —— `apps/file-service/src/file.grpc.controller.ts`

```ts
@Controller()
export class FileGrpcController {
  @GrpcMethod('FileService', 'GetFile')
  async getFile(request: GetFileGrpcDto): Promise<FileResponse> {
    const meta = await this.fileService.findOne(request.id);   // 不存在则抛 NotFoundException
    return { file: meta };                                      // 必须包成 { file }，与 proto 对齐
  }
}
```

返回裸 `FileMeta` 会导致序列化后 `file` 字段为空 —— proto 里是 `FileResponse { FileMeta file = 1; }`。

---

## 6. 两个容易踩的坑（已在代码里处理，改代码时别改回去）

### 6.1 `connectMicroservice` 默认不给 microservice 继承 ApplicationConfig

`@nestjs/core` 的 `connectMicroservice` 在 `inheritAppConfig` 为假时会 **new 一个新的 ApplicationConfig**。
后果是注册在 `app` 上的 `useGlobalPipes` / `useGlobalFilters` / `useGlobalInterceptors`
**完全作用不到 gRPC 通道**，表现为：

- gRPC 入参校验静默失效
- gRPC 侧的 `HttpException` 不会被转成对应状态码，一律 `2 UNKNOWN: Internal server error`

所以 `bootstrap-hybrid-app.ts` 里显式传了 `{ inheritAppConfig: true }`。

### 6.2 gRPC 异常过滤器必须发射裸 payload 对象，不能发射 `RpcException` 实例

`@grpc/grpc-js` 的 `serverErrorToStatus()` 判断的是：

```js
if ('code' in error && typeof error.code === 'number' && Number.isInteger(error.code)) {
  status.code = error.code;
  if ('details' in error && typeof error.details === 'string') status.details = error.details;
}
```

`RpcException` 把 payload 挂在 `this.error` 上，顶层没有 `code` 属性，
所以 `throwError(() => new RpcException({ code: 5, message: 'x' }))` 会退化成 `2 UNKNOWN`。

Nest 内置的 `BaseRpcExceptionFilter` 正是因此发射 `getError()` 得到的那个**普通对象**。
我们注册了自定义全局过滤器就绕开了它，所以 `all-exceptions.filter.ts` 的 `handleRpc` 返回的是
`throwError(() => ({ code, message }))`。注意 `message` 会被 grpc-js 放进 `details`。

---

## 7. 设计说明

**txt 持久化约定** —— 一个实体一个文件 `<dir>/<id>.txt`，内容是 pretty-print 的 JSON；
`<dir>/index.txt` 存自增计数器的纯数字。写入走「临时文件 + rename」保证原子性，
同一路径的读-改-写通过内存队列串行化，避免并发覆盖（`FileStorageService.withLock`）。

**`DATA_DIR` 的解析** —— `nest start` 的工作目录是 `apps/bug-service`，
`node dist/main.js` 则是 `apps/bug-service/dist`，同一个 `./data` 会解析到不同位置。
`path.util.ts` 从 cwd 向上查找含 `pnpm-workspace.yaml` 的目录作为仓库根，保证两个服务读写同一个 `data/`。

**为什么不用 Nest CLI 的单 package.json monorepo** —— 那种模式下 `nest build` 产出的 `dist` 里
仍保留 TS 路径别名，运行时需要额外挂 `tsconfig-paths`。用真实子包（pnpm symlink）则编译期和运行期都干净，
每个服务也能独立构建、独立部署。

**hybrid app 只建一个 IOC 容器** —— 用 `app.connectMicroservice()` 而不是
`NestFactory.createMicroservice()`，后者会为同一个模块再建一个容器，
导致 `FileStorageService` 的内存队列和 gRPC 客户端连接都重复一份。

**状态流转不做状态机校验** —— 按需求任意流转都允许，但 `status` 的取值范围仍由 DTO 卡住
（`@IsIn(BUG_STATUSES)`），否则 txt 里会写进 `done` / `已完成` 这类脏数据。

---

## 8. 已知边界

- **无鉴权**：`operator` / `creator` 由调用方直接传入，没有身份校验层
- **无分页**：`ListBugs` 全量读目录后过滤，Bug 数量大时会有性能问题
- **无并发写冲突检测**：写串行只保证同一进程内不互相覆盖，多副本部署需要外部锁
- **proto 无 `AddComment`**：评论功能只能走 HTTP，但 `history` 里仍会写 `action='comment'`
- **未提供 Dockerfile / docker-compose**：容器化时注意 `FILE_SERVICE_GRPC_URL` 要改成 `file-service:5002`
