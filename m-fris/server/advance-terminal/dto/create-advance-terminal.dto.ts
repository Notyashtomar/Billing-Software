import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateAdvanceTerminalDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  terminalCode?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @Matches(/^[A-Za-z]+(?: [A-Za-z]+)*$/, {
    message: 'Location may only contain letters and spaces.',
  })
  location?: string;

  @IsOptional()
  @IsBoolean()
  block?: boolean;
}
