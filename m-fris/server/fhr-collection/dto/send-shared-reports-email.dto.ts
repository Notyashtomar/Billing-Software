import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SharedReportAttachmentDto {
  @IsString()
  @MaxLength(255)
  filename: string;

  @IsString()
  @MaxLength(15_000_000)
  pdfBase64: string;
}

export class SendSharedReportsEmailDto {
  @IsString()
  @IsIn(['airline-fhr', 'gh-rep-bundle'])
  shareTarget: 'airline-fhr' | 'gh-rep-bundle';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SharedReportAttachmentDto)
  attachments: SharedReportAttachmentDto[];
}
