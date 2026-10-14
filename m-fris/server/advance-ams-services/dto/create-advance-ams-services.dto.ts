import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateAdvanceAmsServiceDto {
  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
