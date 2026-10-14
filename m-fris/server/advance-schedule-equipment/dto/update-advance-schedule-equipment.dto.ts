import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const BASIS = ['ATA', 'ATD'] as const;
const SIGN = ['Plus', 'Minus'] as const;
const BODY = ['NB', 'WB'] as const;

export class UpdateAdvanceScheduleEquipmentDto {
  @IsOptional()
  @IsString()
  airlineName?: string;

  @IsOptional()
  @IsString()
  airlineCode?: string;

  @IsOptional()
  @IsIn(BODY)
  aircraftBody?: string;

  @IsOptional()
  @IsBoolean()
  splitOperation?: boolean;

  @IsOptional()
  @IsString()
  equipmentName?: string;

  @IsOptional()
  @IsString()
  equipmentCode?: string;

  @IsOptional()
  @IsBoolean()
  timeRequired?: boolean;

  @IsOptional()
  @IsIn(BASIS)
  option1Basis?: string;

  @IsOptional()
  @IsIn(SIGN)
  option1Sign?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  option1Minutes?: number;

  @IsOptional()
  @IsIn(BASIS)
  option2Basis?: string;

  @IsOptional()
  @IsIn(SIGN)
  option2Sign?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  option2Minutes?: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
