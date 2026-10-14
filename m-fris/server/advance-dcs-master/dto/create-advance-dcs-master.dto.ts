import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class CreateAdvanceDcsMasterDto {
  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @Matches(/^[A-Za-z]+(?: [A-Za-z]+)*$/, {
    message: 'DCS name may only contain letters and spaces.',
  })
  dcsName?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
