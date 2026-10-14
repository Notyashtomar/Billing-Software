import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { StaffAssignmentDto } from './staff-assignment.dto';

export class CreatePaxDutyAllocationDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  shift: string;

  @IsString()
  flight: string;

  @IsString()
  flightNo: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StaffAssignmentDto)
  staffAssignments: StaffAssignmentDto[];
}
