import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { StaffGseAssignmentDto } from './create-advance-staff.dto';

export class UpdateAdvanceStaffDto {
  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @Matches(/^[A-Za-z]+(?: [A-Za-z]+)*$/, {
    message: 'Employee name may only contain letters and spaces.',
  })
  employeeName?: string;

  @IsOptional()
  @IsString()
  manpower?: string;

  @IsOptional()
  @IsString()
  manpowerCode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffGseAssignmentDto)
  gseAssigned?: StaffGseAssignmentDto[];

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @Matches(/^[A-Za-z]+(?: [A-Za-z]+)*$/, {
    message: 'Designation may only contain letters and spaces.',
  })
  designation?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status?: string;
}
