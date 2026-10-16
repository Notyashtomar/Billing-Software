import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { TRAINING_DEPARTMENTS } from '../constants/training-departments.constant';

export class CreateTrainingMatrixDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  stationIds: string[];

  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  minPassPercent?: number | null;

  @ValidateIf((dto: CreateTrainingMatrixDto) => dto.frequencyMonths !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  frequencyMonths?: number | null;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsIn([...TRAINING_DEPARTMENTS], { each: true })
  departments: string[];

  @IsOptional()
  @IsString()
  note?: string;
}
