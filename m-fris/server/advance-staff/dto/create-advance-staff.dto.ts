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

const PERSON_NAME = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const PERSON_NAME_MESSAGE = 'Employee name may only contain letters and spaces.';

export class StaffGseAssignmentDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateAdvanceStaffDto {
  @IsString()
  employeeCode: string;

  @IsString()
  @Matches(PERSON_NAME, { message: PERSON_NAME_MESSAGE })
  employeeName: string;

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
  @Matches(PERSON_NAME, {
    message: 'Designation may only contain letters and spaces.',
  })
  designation?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Active', 'Inactive'])
  status?: string;
}
