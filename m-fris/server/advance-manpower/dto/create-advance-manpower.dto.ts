import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateAdvanceManpowerDto {
  @IsOptional()
  @IsString()
  manpower?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
