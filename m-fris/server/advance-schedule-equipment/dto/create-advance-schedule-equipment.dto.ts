import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const BASIS = ['ATA', 'ATD'] as const;
const SIGN = ['Plus', 'Minus'] as const;
const BODY = ['NB', 'WB'] as const;

export class CreateAdvanceScheduleEquipmentDto {
  @IsString()
  @IsNotEmpty()
  airlineName: string;

  @IsString()
  @IsNotEmpty()
  airlineCode: string;

  @IsIn(BODY)
  @IsNotEmpty()
  aircraftBody: string;

  @IsOptional()
  @IsBoolean()
  splitOperation?: boolean;

  @IsString()
  @IsNotEmpty()
  equipmentName: string;

  @IsString()
  @IsNotEmpty()
  equipmentCode: string;

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
