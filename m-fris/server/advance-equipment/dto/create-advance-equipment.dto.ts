import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';

const CATEGORY = ['M', 'NM', 'T'] as const;

export class CreateAdvanceEquipmentDto {
  @IsOptional()
  @IsString()
  equipmentName?: string;

  @IsOptional()
  @IsString()
  equipmentCode?: string;

  @IsOptional()
  @IsIn(CATEGORY)
  category?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
