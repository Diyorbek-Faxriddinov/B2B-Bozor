import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { Auth, CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { env, uploadRoot } from '../config/env';
import { ApiError, validationError } from '../common/errors';
import { randomToken } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** Images only: re-encoded to WebP (max 1600 px), which also strips EXIF/GPS metadata. */
@ApiTags('uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @Auth()
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: env().MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
  async upload(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) validationError({ file: 'REQUIRED' });
    if (!IMAGE_TYPES.includes(file.mimetype)) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only images are allowed');

    let out: Buffer;
    try {
      out = await sharp(file.buffer, { animated: false })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'File is not a valid image');
    }

    const now = new Date();
    const dir = join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    const name = `${randomToken(12)}.webp`;
    await mkdir(join(uploadRoot(), dir), { recursive: true });
    await writeFile(join(uploadRoot(), dir, name), out);
    const path = `${dir.replace(/\\/g, '/')}/${name}`;
    await this.prisma.upload.create({ data: { userId: u.id, path, mime: 'image/webp', size: out.length } });
    return { url: `${env().APP_URL.replace(/\/$/, '')}/uploads/${path}` };
  }
}
