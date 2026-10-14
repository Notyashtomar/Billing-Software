import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReportEntryDto {
  @IsOptional()
  checked?: boolean;

  @IsOptional()
  @IsString()
  reportName?: string;

  @IsOptional()
  @IsString()
  reportNo?: string;
}

export class CreateAttachmentsDto {
  // @IsNumber()
  // fhrNo: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportEntryDto)
  reports?: ReportEntryDto[];

  @IsOptional()
  @IsString()
  noOfScanReports?: string;

  @IsOptional()
  @IsString()
  attachmentFileName?: string;

  @IsOptional()
  @IsString()
  attachmentPath?: string;
}
