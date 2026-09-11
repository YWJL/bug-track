import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc, RpcException } from '@nestjs/microservices';
import {
  DEFAULT_GRPC_TIMEOUT_MS,
  FILE_SERVICE_CLIENT,
  FileMeta,
  FileResponse,
  FileStorageService,
  mapServiceErrorToRpcException,
  resolveDataDir,
} from '@bug-track/common';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { join } from 'path';
import { firstValueFrom, timeout } from 'rxjs';
import { AddCcDto, RemoveCcDto } from './dto/cc.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { AssignBugDto } from './dto/assign-bug.dto';
import { AttachFileDto } from './dto/attach-file.dto';
import { CreateBugDto } from './dto/create-bug.dto';
import { ListBugsDto } from './dto/list-bugs.dto';
import { UpdateBugStatusDto } from './dto/update-bug-status.dto';
import { Bug, BugStatus } from './interfaces/bug.interface';
import { FileServiceClient } from './interfaces/file-service-client.interface';

/**
 * Bug 业务服务：生命周期流转、指派、抄送、附件。
 *
 * 持久化：一个 Bug 一个 txt（data/bugs/BUG-0001.txt），
 * 通过 FileStorageService 保证同一文件的读-改-写串行。
 */
@Injectable()
export class BugService implements OnModuleInit {
  private readonly logger = new Logger(BugService.name);

  /** Bug 实体目录 */
  private readonly bugsDir: string;

  /** 调用 file-service 的超时时间 */
  private readonly grpcTimeoutMs: number;

  /**
   * file-service 的 gRPC 客户端。
   * 必须等 onModuleInit 之后才能真正拿到代理对象，所以用 `!` 声明。
   */
  private fileService!: FileServiceClient;

  constructor(
    private readonly storage: FileStorageService,
    private readonly config: ConfigService,
    @Inject(FILE_SERVICE_CLIENT) private readonly fileClient: ClientGrpc,
  ) {
    this.bugsDir = join(resolveDataDir(config), 'bugs');
    this.grpcTimeoutMs = Number(
      config.get<string>('GRPC_TIMEOUT_MS', String(DEFAULT_GRPC_TIMEOUT_MS)),
    );
  }

  onModuleInit(): void {
    // ClientGrpc 在模块初始化完成前只是个壳，这里才拿得到真正的方法代理
    this.fileService = this.fileClient.getService<FileServiceClient>('FileService');
    this.logger.log(`file-service gRPC 客户端已就绪；Bug 数据目录: ${this.bugsDir}`);
  }

  // ==========================================================================
  // 创建与查询
  // ==========================================================================

  /** 创建 Bug，状态固定从 active 起步，同时写入第一条 history */
  async create(dto: CreateBugDto): Promise<Bug> {
    const id = await this.storage.nextId(this.bugsDir, 'BUG');
    const now = new Date().toISOString();
    const status: BugStatus = 'active';

    const bug: Bug = {
      id,
      title: dto.title,
      description: dto.description ?? '',
      status,
      severity: dto.severity ?? 'medium',
      creator: dto.creator,
      assignee: dto.assignee ?? '',
      ccList: dto.ccList ?? [],
      attachmentIds: [],
      createdAt: now,
      updatedAt: now,
      history: [
        {
          action: 'create',
          from: '',
          to: status,
          operator: dto.creator,
          remark: dto.assignee ? `创建 Bug，指派给 ${dto.assignee}` : '创建 Bug',
          at: now,
        },
      ],
    };

    await this.storage.writeEntity(this.bugsDir, id, bug);
    this.logger.log(`创建 Bug: ${id}「${bug.title}」by ${bug.creator}`);
    return bug;
  }

  /** 查询单个 Bug，不存在抛 404（gRPC 通道上会被转成 NOT_FOUND） */
  async findOne(id: string): Promise<Bug> {
    return this.loadBug(id);
  }

  /** 列表查询，支持按 status / assignee 过滤（空条件不参与过滤） */
  async findAll(query: ListBugsDto): Promise<Bug[]> {
    const bugs = await this.storage.listEntities<Bug>(this.bugsDir);

    return bugs
      .filter((bug) => !query.status || bug.status === query.status)
      .filter((bug) => !query.assignee || bug.assignee === query.assignee)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  // ==========================================================================
  // 生命周期
  // ==========================================================================

  /**
   * 状态流转。
   * 业务上不做状态机校验，任意流转都允许（spec 明确要求），
   * 但入参的 status 取值范围由 DTO 卡住。
   */
  async updateStatus(request: UpdateBugStatusDto): Promise<Bug> {
    const bug = await this.loadBug(request.id);
    const from = bug.status;
    const at = new Date().toISOString();

    bug.status = request.status;
    bug.history.push({
      action: 'update_status',
      from,
      to: request.status,
      operator: request.operator ?? 'system',
      remark: request.remark ?? '',
      at,
    });
    bug.updatedAt = at;

    await this.storage.writeEntity(this.bugsDir, bug.id, bug);
    this.logger.log(`状态流转: ${bug.id} ${from} -> ${request.status}`);
    return bug;
  }

  /** 指派 / 转派 */
  async assign(request: AssignBugDto): Promise<Bug> {
    const bug = await this.loadBug(request.id);
    const from = bug.assignee;
    const at = new Date().toISOString();

    bug.assignee = request.assignee;
    bug.history.push({
      action: 'assign',
      from,
      to: request.assignee,
      operator: request.operator ?? 'system',
      remark:
        request.remark ?? (from ? `由 ${from} 转派给 ${request.assignee}` : `指派给 ${request.assignee}`),
      at,
    });
    bug.updatedAt = at;

    await this.storage.writeEntity(this.bugsDir, bug.id, bug);
    this.logger.log(`指派: ${bug.id} ${from || '(未指派)'} -> ${request.assignee}`);
    return bug;
  }

  /** 添加抄送人（已存在的会自动去重，全部重复则不写盘） */
  async addCc(request: AddCcDto): Promise<Bug> {
    const bug = await this.loadBug(request.id);
    const before = [...bug.ccList];
    const added = request.users.filter((user) => !bug.ccList.includes(user));

    if (added.length === 0) {
      this.logger.warn(`${bug.id} 抄送人无变化，跳过写入: ${request.users.join(', ')}`);
      return bug;
    }

    bug.ccList.push(...added);
    const at = new Date().toISOString();
    bug.history.push({
      action: 'cc',
      from: before.join(','),
      to: bug.ccList.join(','),
      operator: request.operator ?? 'system',
      remark: `新增抄送: ${added.join(', ')}`,
      at,
    });
    bug.updatedAt = at;

    await this.storage.writeEntity(this.bugsDir, bug.id, bug);
    this.logger.log(`新增抄送: ${bug.id} += ${added.join(', ')}`);
    return bug;
  }

  /** 移除抄送人 */
  async removeCc(request: RemoveCcDto): Promise<Bug> {
    const bug = await this.loadBug(request.id);
    const before = [...bug.ccList];
    const removed = request.users.filter((user) => bug.ccList.includes(user));

    if (removed.length === 0) {
      this.logger.warn(`${bug.id} 待移除的抄送人都不在列表里，跳过写入: ${request.users.join(', ')}`);
      return bug;
    }

    bug.ccList = bug.ccList.filter((user) => !removed.includes(user));
    const at = new Date().toISOString();
    bug.history.push({
      action: 'cc',
      from: before.join(','),
      to: bug.ccList.join(','),
      operator: request.operator ?? 'system',
      remark: `移除抄送: ${removed.join(', ')}`,
      at,
    });
    bug.updatedAt = at;

    await this.storage.writeEntity(this.bugsDir, bug.id, bug);
    this.logger.log(`移除抄送: ${bug.id} -= ${removed.join(', ')}`);
    return bug;
  }

  /** 追加评论（仅 HTTP 接口，proto 里没有对应的 rpc） */
  async addComment(request: AddCommentDto): Promise<Bug> {
    const bug = await this.loadBug(request.id);
    const at = new Date().toISOString();

    bug.history.push({
      action: 'comment',
      from: '',
      to: '',
      operator: request.operator ?? 'system',
      remark: request.content,
      at,
    });
    bug.updatedAt = at;

    await this.storage.writeEntity(this.bugsDir, bug.id, bug);
    this.logger.log(`评论: ${bug.id} by ${request.operator ?? 'system'}`);
    return bug;
  }

  // ==========================================================================
  // 附件 —— 跨服务 gRPC 调用
  // ==========================================================================

  /**
   * 附加一个「已存在」的文件到 Bug 上。
   *
   * 这里就是跨微服务 gRPC 调用的核心样例，完整流程：
   *   1. 通过 gRPC 调 file-service 的 GetFile，确认 fileId 真实存在
   *   2. 读取本地 Bug 实体
   *   3. 写入 history（action=attach）
   *   4. 落盘返回
   *
   * 第 1 步失败时会**透传下游的 gRPC status**：
   * file-service 说 NOT_FOUND，这里就往上报 NOT_FOUND，
   * 而不是包成 INTERNAL —— 否则调用方没法区分"文件不存在"和"文件服务挂了"。
   */
  async attachFile(request: AttachFileDto): Promise<Bug> {
    const operator = request.operator ?? 'system';
    const startedAt = Date.now();

    // ── 1. 跨服务 gRPC 调用，校验文件存在 ────────────────────────────────
    const file = await this.fetchFileMetaFromFileService(request.fileId);

    // ── 2. 读取 Bug，去重后挂上 fileId ───────────────────────────────────
    const bug = await this.loadBug(request.bugId);
    const alreadyAttached = bug.attachmentIds.includes(file.id);
    if (!alreadyAttached) {
      bug.attachmentIds.push(file.id);
    }

    // ── 3. 写 history ───────────────────────────────────────────────────
    const at = new Date().toISOString();
    bug.history.push({
      action: 'attach',
      from: '',
      to: file.id,
      operator,
      remark: alreadyAttached
        ? `重复附加附件 ${file.originalName}（已忽略）`
        : `附加附件 ${file.originalName} (${file.size} bytes)`,
      at,
    });
    bug.updatedAt = at;

    // ── 4. 落盘 ─────────────────────────────────────────────────────────
    await this.storage.writeEntity(this.bugsDir, bug.id, bug);

    this.logger.log(
      `附加附件完成: ${file.id} -> ${bug.id}，本轮跨服务 gRPC 耗时 ${Date.now() - startedAt}ms`,
    );
    return bug;
  }

  /**
   * 上传文件并直接附加到 Bug 上。
   *
   * 与 attachFile 的区别：文件本体不落在 bug-service，
   * 而是把 Buffer 通过 gRPC `UploadFile` 交给 file-service 存储，
   * 拿回 FILE-xxxx 之后再挂到 Bug 上。
   * 这正是"文件上传调用其他微服务接口"的落地方式。
   */
  async uploadAndAttach(
    bugId: string,
    file: { originalName: string; mimeType: string; content: Buffer },
    operator: string,
  ): Promise<Bug> {
    const startedAt = Date.now();

    this.logger.log(
      `[gRPC →] file-service FileService.UploadFile 请求: ` +
        `originalName=${file.originalName}, bytes=${file.content.length}`,
    );

    let response: FileResponse;
    try {
      response = await firstValueFrom(
        this.fileService
          .uploadFile({
            originalName: file.originalName,
            mimeType: file.mimeType,
            content: file.content,
            uploadedBy: operator,
          })
          .pipe(timeout(this.grpcTimeoutMs)),
      );
    } catch (error) {
      this.logger.error(
        `[gRPC ←] file-service UploadFile 调用失败(${Date.now() - startedAt}ms): ${(error as Error)?.message}`,
      );
      throw mapServiceErrorToRpcException(error, '调用 file-service 上传文件失败');
    }

    const meta = response?.file;
    if (!meta?.id) {
      throw new RpcException({
        code: GrpcStatus.INTERNAL,
        message: 'file-service 返回的 UploadFile 响应缺少 file 字段',
      });
    }

    this.logger.log(
      `[gRPC ←] file-service UploadFile 响应(${Date.now() - startedAt}ms): ` +
        `${meta.id} -> ${meta.storagePath}`,
    );

    // 文件已经在 file-service 落好了，这里只负责把 ID 挂上去
    return this.attachFile({ bugId, fileId: meta.id, operator });
  }

  /**
   * 通过 gRPC 向 file-service 查询文件元数据。
   *
   * 单独抽出来是为了把「调用 → 记日志 → 错误映射」这一套样板集中在一处，
   * 别的业务方法要调 file-service 时照着复制即可。
   */
  private async fetchFileMetaFromFileService(fileId: string): Promise<FileMeta> {
    this.logger.log(
      `[gRPC →] file-service FileService.GetFile 请求: ${JSON.stringify({ id: fileId })}`,
    );
    const startedAt = Date.now();

    let response: FileResponse;
    try {
      response = await firstValueFrom(
        this.fileService.getFile({ id: fileId }).pipe(timeout(this.grpcTimeoutMs)),
      );
    } catch (error) {
      this.logger.error(
        `[gRPC ←] file-service GetFile 调用失败(${Date.now() - startedAt}ms): ${(error as Error)?.message}`,
      );
      throw mapServiceErrorToRpcException(error, `调用 file-service 校验文件 ${fileId} 失败`);
    }

    this.logger.log(
      `[gRPC ←] file-service GetFile 响应(${Date.now() - startedAt}ms): ${JSON.stringify(response)}`,
    );

    const file = response?.file;
    if (!file?.id) {
      // 下游返回 OK 却没带 file，属于契约不一致，按"文件不存在"处理更贴近调用方预期
      throw new RpcException({
        code: GrpcStatus.NOT_FOUND,
        message: `文件 ${fileId} 不存在`,
      });
    }
    return file;
  }

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  /** 读取 Bug，不存在直接抛 404 */
  private async loadBug(id: string): Promise<Bug> {
    const bug = await this.storage.readEntity<Bug>(this.bugsDir, id);
    if (!bug) {
      throw new NotFoundException(`Bug ${id} 不存在`);
    }
    return bug;
  }
}
