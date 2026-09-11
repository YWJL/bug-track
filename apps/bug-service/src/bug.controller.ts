import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OmitType } from '@nestjs/mapped-types';
import type { Bug } from './interfaces/bug.interface';
import { AddCcDto, RemoveCcDto } from './dto/cc.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { AssignBugDto } from './dto/assign-bug.dto';
import { AttachFileDto } from './dto/attach-file.dto';
import { CreateBugDto } from './dto/create-bug.dto';
import { IdParamDto } from './dto/id-param.dto';
import { ListBugsDto } from './dto/list-bugs.dto';
import { UploadAttachmentHttpDto } from './dto/upload-attachment.dto';
import { UpdateBugStatusDto } from './dto/update-bug-status.dto';
import { BugService } from './bug.service';

/**
 * 带路径参数的路由，其 id 从 URL 拿而不是从 body 拿。
 * 用 OmitType 从 gRPC 共用的 DTO 上「挖掉」id 字段，
 * 避免同一个结构写两遍（校验规则也随之继承，不会漂移）。
 */
class UpdateStatusBodyDto extends OmitType(UpdateBugStatusDto, ['id'] as const) {}
class AssignBodyDto extends OmitType(AssignBugDto, ['id'] as const) {}
class AddCcBodyDto extends OmitType(AddCcDto, ['id'] as const) {}
class RemoveCcBodyDto extends OmitType(RemoveCcDto, ['id'] as const) {}
class CommentBodyDto extends OmitType(AddCommentDto, ['id'] as const) {}
class AttachFileBodyDto extends OmitType(AttachFileDto, ['bugId'] as const) {}

/**
 * bug-service 的 HTTP 接口（:3001）。
 *
 * 覆盖 Bug 的完整生命周期：创建 → 指派 → 抄送 → 流转状态 → 附加附件。
 * 这些能力在 gRPC 通道上同样可用（见 BugGrpcController），
 * HTTP 这一套主要是给人调试、以及给前端直连用的。
 */
@Controller('bugs')
export class BugController {
  constructor(private readonly bugService: BugService) {}

  /**
   * POST /bugs
   * 创建 Bug
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateBugDto): Promise<Bug> {
    return this.bugService.create(body);
  }

  /**
   * GET /bugs?status=active&assignee=zhangsan
   * 列表查询，两个条件都可选
   */
  @Get()
  async findAll(@Query() query: ListBugsDto): Promise<Bug[]> {
    return this.bugService.findAll(query);
  }

  /**
   * GET /bugs/:id
   */
  @Get(':id')
  async findOne(@Param() params: IdParamDto): Promise<Bug> {
    return this.bugService.findOne(params.id);
  }

  /**
   * PATCH /bugs/:id/status
   * 状态流转（任意流转都允许）
   */
  @Patch(':id/status')
  async updateStatus(
    @Param() params: IdParamDto,
    @Body() body: UpdateStatusBodyDto,
  ): Promise<Bug> {
    return this.bugService.updateStatus({ id: params.id, ...body });
  }

  /**
   * PATCH /bugs/:id/assign
   * 指派 / 转派
   */
  @Patch(':id/assign')
  async assign(@Param() params: IdParamDto, @Body() body: AssignBodyDto): Promise<Bug> {
    return this.bugService.assign({ id: params.id, ...body });
  }

  /**
   * POST /bugs/:id/cc
   * 添加抄送人
   */
  @Post(':id/cc')
  @HttpCode(HttpStatus.OK)
  async addCc(@Param() params: IdParamDto, @Body() body: AddCcBodyDto): Promise<Bug> {
    return this.bugService.addCc({ id: params.id, ...body });
  }

  /**
   * DELETE /bugs/:id/cc
   * 移除抄送人（DELETE 带 body 是允许的，但部分客户端不支持，
   * 用 curl 时要显式加 -X DELETE）
   */
  @Delete(':id/cc')
  async removeCc(@Param() params: IdParamDto, @Body() body: RemoveCcBodyDto): Promise<Bug> {
    return this.bugService.removeCc({ id: params.id, ...body });
  }

  /**
   * POST /bugs/:id/comments
   * 追加评论（HTTP 独有，proto 里没有对应 rpc）
   */
  @Post(':id/comments')
  @HttpCode(HttpStatus.OK)
  async addComment(@Param() params: IdParamDto, @Body() body: CommentBodyDto): Promise<Bug> {
    return this.bugService.addComment({ id: params.id, ...body });
  }

  /**
   * POST /bugs/:id/attachments
   * 把一个「已经在 file-service 里」的文件挂到 Bug 上。
   * 内部会通过 gRPC 调 file-service 的 GetFile 校验存在性。
   */
  @Post(':id/attachments')
  @HttpCode(HttpStatus.OK)
  async attachFile(
    @Param() params: IdParamDto,
    @Body() body: AttachFileBodyDto,
  ): Promise<Bug> {
    return this.bugService.attachFile({ bugId: params.id, ...body });
  }

  /**
   * POST /bugs/:id/attachments/upload
   * multipart 上传文件 —— 本体直接通过 gRPC 转发给 file-service 存储，
   * bug-service 自己不落任何文件，只保存返回的 FILE-xxxx 引用。
   */
  @Post(':id/attachments/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param() params: IdParamDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadAttachmentHttpDto,
  ): Promise<Bug> {
    if (!file) {
      throw new BadRequestException('未接收到文件，请使用 multipart/form-data 且文件字段名为 file');
    }

    return this.bugService.uploadAndAttach(
      params.id,
      {
        originalName: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer,
      },
      body.operator ?? 'system',
    );
  }
}
