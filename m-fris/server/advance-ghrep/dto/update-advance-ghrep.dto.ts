import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateAdvanceGhrepDto {
  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @Matches(/^[A-Za-z]+(?: [A-Za-z]+)*$/, {
    message: 'Employee name may only contain letters.',
  })
  employeeName?: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsEmail()
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
