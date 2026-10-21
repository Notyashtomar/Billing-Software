import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type StoredFile = {
  buffer: Buffer;
  absolutePath?: string;
};

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly driver = String(
    process.env.FILE_STORAGE_DRIVER ?? 'local',
  ).toLowerCase();
  private readonly localRoot = path.join(process.cwd(), 'uploads');
  private readonly s3Bucket = process.env.FILE_STORAGE_S3_BUCKET?.trim();
  private readonly s3Region = process.env.FILE_STORAGE_S3_REGION?.trim();
  private readonly s3Prefix = String(process.env.FILE_STORAGE_S3_PREFIX ?? '')
    .replace(/^\/+|\/+$/g, '');

  private s3Client: {
    send: (command: unknown) => Promise<unknown>;
  } | null = null;

  private async getS3Client(): Promise<NonNullable<typeof this.s3Client>> {
    if (this.s3Client) return this.s3Client;
    if (!this.s3Bucket || !this.s3Region) {
      throw new Error(
        'FILE_STORAGE_S3_BUCKET and FILE_STORAGE_S3_REGION are required when FILE_STORAGE_DRIVER=s3',
      );
    }
    const { S3Client } = await import('@aws-sdk/client-s3');
    this.s3Client = new S3Client({ region: this.s3Region });
    return this.s3Client;
  }

  private objectKey(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return this.s3Prefix ? `${this.s3Prefix}/${normalized}` : normalized;
  }

  private localAbsolutePath(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const absolute = path.join(this.localRoot, normalized);
    const resolvedRoot = path.resolve(this.localRoot);
    const resolved = path.resolve(absolute);
    if (!resolved.startsWith(resolvedRoot)) {
      throw new Error('Invalid storage path');
    }
    return resolved;
  }

  async write(relativePath: string, data: Buffer): Promise<void> {
    if (this.driver === 's3') {
      const client = await this.getS3Client();
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: this.objectKey(relativePath),
          Body: data,
        }),
      );
      return;
    }

    const absolute = this.localAbsolutePath(relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, data);
  }

  async read(relativePath: string): Promise<StoredFile> {
    if (this.driver === 's3') {
      const client = await this.getS3Client();
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const response = (await client.send(
        new GetObjectCommand({
          Bucket: this.s3Bucket,
          Key: this.objectKey(relativePath),
        }),
      )) as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } };
      const bytes = await response.Body?.transformToByteArray?.();
      if (!bytes) {
        throw new Error('Stored object is empty');
      }
      return { buffer: Buffer.from(bytes) };
    }

    const absolute = this.localAbsolutePath(relativePath);
    if (!fs.existsSync(absolute)) {
      throw new Error('File not found');
    }
    return {
      buffer: fs.readFileSync(absolute),
      absolutePath: absolute,
    };
  }

  exists(relativePath: string): boolean {
    if (this.driver === 's3') {
      this.logger.warn('S3 exists() check skipped; use read() and handle errors');
      return true;
    }
    return fs.existsSync(this.localAbsolutePath(relativePath));
  }

  resolveSendFilePath(relativePath: string): string | null {
    if (this.driver === 's3') return null;
    const absolute = this.localAbsolutePath(relativePath);
    return fs.existsSync(absolute) ? absolute : null;
  }

  async delete(relativePath: string): Promise<void> {
    if (this.driver === 's3') {
      const client = await this.getS3Client();
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await client.send(
        new DeleteObjectCommand({
          Bucket: this.s3Bucket,
          Key: this.objectKey(relativePath),
        }),
      );
      return;
    }

    const absolute = this.localAbsolutePath(relativePath);
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  }
}
