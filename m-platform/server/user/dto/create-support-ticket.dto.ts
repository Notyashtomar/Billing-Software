import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const URGENCY = ['urgent', 'non-urgent'] as const;
const ISSUE_TYPES = [
  'Cosmetic',
  'Minor',
  'Major',
  'Catastrophic',
  'Show stopper',
] as const;

export class SupportTicketAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  sizeBytes: number;

  @IsString()
  @IsNotEmpty()
  base64: string;
}

export class CreateSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  navigationPageLabel: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  navigationPagePath: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  subPageLabel: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  subPagePath: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  issueReason: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  description: string;

  @IsIn(URGENCY)
  urgency: (typeof URGENCY)[number];

  @IsIn(ISSUE_TYPES)
  issueType: (typeof ISSUE_TYPES)[number];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportTicketAttachmentDto)
  attachments?: SupportTicketAttachmentDto[];
}
