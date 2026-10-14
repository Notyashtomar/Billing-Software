import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendFhrReportEmailDto {
  @IsEmail()
  recipientEmail: string;

  @IsString()
  @MaxLength(15_000_000)
  pdfBase64: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pdfFilename?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  flightNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  airline?: string;
}
