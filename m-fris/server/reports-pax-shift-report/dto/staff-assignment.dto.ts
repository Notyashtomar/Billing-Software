import { IsArray, IsString } from 'class-validator';

export class StaffAssignmentDto {
  @IsString()
  staff: string;

  @IsString()
  employeeCode: string;

  @IsString()
  employeeName: string;

  @IsArray()
  @IsString({ each: true })
  dutyAllocations: string[];
}
