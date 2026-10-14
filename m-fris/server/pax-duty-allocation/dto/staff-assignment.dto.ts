import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class StaffAssignmentDto {
  @IsString()
  staff: string;

  @IsString()
  employeeCode: string;

  @IsString()
  employeeName: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  dutyAllocations: string[];
}
