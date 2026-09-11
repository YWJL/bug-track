import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AddCcDto, RemoveCcDto } from './dto/cc.dto';
import { AssignBugDto } from './dto/assign-bug.dto';
import { AttachFileDto } from './dto/attach-file.dto';
import { CreateBugDto } from './dto/create-bug.dto';
import { GetBugDto } from './dto/get-bug.dto';
import { ListBugsDto } from './dto/list-bugs.dto';
import { UpdateBugStatusDto } from './dto/update-bug-status.dto';
import { Bug } from './interfaces/bug.interface';
import { BugService } from './bug.service';

/**
 * bug-service 的 gRPC 接口（:5001）。
 *
 * 每个方法都严格对应 libs/proto/bug.proto 里的一条 rpc：
 * - 方法名/入参类型必须与 proto 一致，`@GrpcMethod` 的第二个参数就是 proto 里的 rpc 名
 * - 返回类型只有 `BugResponse` 和 `ListBugsResponse` 两种，
 *   所以单条返回要包成 `{ bug }`，列表要包成 `{ bugs }`，直接返回数组会丢数据
 *
 * Bug 实体（interfaces/bug.interface.ts）的字段名与 proto 的 Bug message 完全对齐，
 * 因此这里不需要做任何字段搬运，直接交给 proto-loader 序列化即可。
 */
@Controller()
export class BugGrpcController {
  private readonly logger = new Logger(BugGrpcController.name);

  constructor(private readonly bugService: BugService) {}

  @GrpcMethod('BugService', 'CreateBug')
  async createBug(request: CreateBugDto): Promise<{ bug: Bug }> {
    this.logger.log(`[gRPC] CreateBug: ${request.title}`);
    return { bug: await this.bugService.create(request) };
  }

  @GrpcMethod('BugService', 'GetBug')
  async getBug(request: GetBugDto): Promise<{ bug: Bug }> {
    this.logger.log(`[gRPC] GetBug: ${request.id}`);
    return { bug: await this.bugService.findOne(request.id) };
  }

  @GrpcMethod('BugService', 'ListBugs')
  async listBugs(request: ListBugsDto): Promise<{ bugs: Bug[] }> {
    this.logger.log(`[gRPC] ListBugs: status=${request.status ?? '*'}, assignee=${request.assignee ?? '*'}`);
    return { bugs: await this.bugService.findAll(request) };
  }

  @GrpcMethod('BugService', 'UpdateBugStatus')
  async updateBugStatus(request: UpdateBugStatusDto): Promise<{ bug: Bug }> {
    this.logger.log(`[gRPC] UpdateBugStatus: ${request.id} -> ${request.status}`);
    return { bug: await this.bugService.updateStatus(request) };
  }

  @GrpcMethod('BugService', 'AssignBug')
  async assignBug(request: AssignBugDto): Promise<{ bug: Bug }> {
    this.logger.log(`[gRPC] AssignBug: ${request.id} -> ${request.assignee}`);
    return { bug: await this.bugService.assign(request) };
  }

  @GrpcMethod('BugService', 'AddCc')
  async addCc(request: AddCcDto): Promise<{ bug: Bug }> {
    this.logger.log(`[gRPC] AddCc: ${request.id} += ${request.users.join(', ')}`);
    return { bug: await this.bugService.addCc(request) };
  }

  @GrpcMethod('BugService', 'RemoveCc')
  async removeCc(request: RemoveCcDto): Promise<{ bug: Bug }> {
    this.logger.log(`[gRPC] RemoveCc: ${request.id} -= ${request.users.join(', ')}`);
    return { bug: await this.bugService.removeCc(request) };
  }

  /**
   * 附加附件。
   *
   * 这是唯一一条会在服务端二次发起 gRPC 调用的 rpc：
   * 外部调用方 -> bug-service(:5001) -> file-service(:5002)。
   * 完整链路可在 bug-service 的日志里看到 `[gRPC →]` / `[gRPC ←]` 两条记录。
   */
  @GrpcMethod('BugService', 'AttachFile')
  async attachFile(request: AttachFileDto): Promise<{ bug: Bug }> {
    this.logger.log(`[gRPC] AttachFile: ${request.fileId} -> ${request.bugId}`);
    return { bug: await this.bugService.attachFile(request) };
  }
}
