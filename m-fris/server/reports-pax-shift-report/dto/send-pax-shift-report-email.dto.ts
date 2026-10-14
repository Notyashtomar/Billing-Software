import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendPaxShiftReportEmailDto {
  @IsString()
  @MaxLength(64)
  flightSerial: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  airline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  flightNo?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  emails: string[];

  @IsString()
  @MaxLength(15_000_000)
  pdfBase64: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pdfFilename?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12_000)
  emailBody?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;
}
