import { BadRequestException, Controller, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UploadQueryDto } from './dto/upload-query.dto';
import { MAX_IMAGE_SIZE_BYTES, MAX_IMAGES_PER_UPLOAD } from './storage.constants';
import { StorageService } from './storage.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

// Files are buffered in memory (Nest's default multer storage) and streamed to Supabase.
// AnyFilesInterceptor accepts any field name ("files", "files[]", "images", "file", ...), so
// clients aren't rejected with "Unexpected file field" for a naming mismatch.
const multerLimits = { fileSize: MAX_IMAGE_SIZE_BYTES, files: MAX_IMAGES_PER_UPLOAD };

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  /** multipart/form-data with one file (field name "file" recommended). */
  @Post('image')
  @UseInterceptors(AnyFilesInterceptor({ limits: { ...multerLimits, files: 1 } }))
  @ResponseMessage('Image uploaded')
  async uploadOne(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Query() query: UploadQueryDto,
    @CurrentUser('userId') userId: string,
  ) {
    const file = files?.[0];
    if (!file) throw new BadRequestException('No file provided. Send multipart/form-data with a "file" field');
    return this.storage.uploadImage(file, query.folder, userId);
  }

  /** multipart/form-data with up to 10 files (field name "files" recommended). */
  @Post('images')
  @UseInterceptors(AnyFilesInterceptor({ limits: multerLimits }))
  @ResponseMessage('Images uploaded')
  async uploadMany(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Query() query: UploadQueryDto,
    @CurrentUser('userId') userId: string,
  ) {
    const uploaded = await this.storage.uploadImages(files ?? [], query.folder, userId);
    return { urls: uploaded.map((u) => u.url), files: uploaded };
  }
}
