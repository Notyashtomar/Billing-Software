import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateReportDto {
  @IsNumber()
  serialNo: number;

  @IsString()
  reportType: string;

  @IsOptional()
  @IsString()
  viewedAt?: string;

  @IsOptional()
  @IsString()
  viewedBy?: string;

  @IsOptional()
  @IsBoolean()
  signatureCleared?: boolean;

  @IsOptional()
  @IsString()
  signatureClearedAt?: string;

  @IsOptional()
  @IsString()
  signatureClearedBy?: string;
}

export class ClearSignatureDto {
  @IsString()
  clearedBy: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
