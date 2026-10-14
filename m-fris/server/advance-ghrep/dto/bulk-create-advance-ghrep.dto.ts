import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Single row for bulk GH representative import (partial columns allowed). */
export class BulkCreateAdvanceGhrepItemDto {
  @IsOptional()
  @IsString()
  employeeName?: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsString()
  emailId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000, { message: 'Signature image is too large' })
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @Matches(/^data:image\/(png|jpeg);base64,/, {
    message: 'signatureUrl must be a PNG/JPEG data URL',
  })
  signatureUrl?: string;
}

export class BulkCreateAdvanceGhrepDto {
  @IsArray()
  rows: BulkCreateAdvanceGhrepItemDto[];
}
