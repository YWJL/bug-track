import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { FileMeta } from '@bug-track/common';
import type { Response } from 'express';
import { UploadFileHttpDto } from './dto/upload-file.http.dto';
import { FileService } from './file.service';

/**
 * file-service 的 HTTP 接口（:3002）。
 * 用于人工调试；服务间的调用走 gRPC（见 FileGrpcController）。
 */
@Controller('files')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * POST /files
   * multipart/form-data，文件字段名固定为 `file`
   *
   * 存储策略与大小上限在 FileModule 的 MulterModule 里通过 .env 配置。
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadFileHttpDto,
  ): Promise<FileMeta> {
    if (!file) {
      throw new BadRequestException('未接收到文件，请使用 multipart/form-data 且文件字段名为 file');
    }

    return this.fileService.saveFromBuffer({
      originalName: file.originalname,
      mimeType: file.mimetype,
      content: file.buffer,
      uploadedBy: body.uploadedBy ?? 'anonymous',
    });
  }

  /**
   * GET /files/:id
   * 查询文件元数据
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<FileMeta> {
    return this.fileService.findOne(id);
  }

  /**
   * GET /files/:id/raw
   * 下载文件本体。
   *
   * 规格里没要求这个接口，但没有它就无法确认"文件真的落盘了"，
   * 调试时很别扭，所以一并提供。
   *
   * 注意：这里用 @Res() 直接写响应流，不会再经过统一响应拦截器。
   */
  @Get(':id/raw')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { meta, content } = await this.fileService.readContent(id);

    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Length', String(content.length));
    // 原始文件名可能含中文，用 RFC 5987 的 filename* 形式，同时保留 ASCII 兜底
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(meta.originalName)}"; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
    );
    res.end(content);
  }
}
