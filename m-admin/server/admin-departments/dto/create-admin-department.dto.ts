import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class DepartmentPermissionsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessTabs?: string[];

  @IsOptional()
  @IsObject()
  accessSubPages?: Record<string, string[]>;
}

export class CreateAdminDepartmentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  subDepartment?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subDepartments?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedStationIds?: string[];

  @IsOptional()
  @IsString()
  departmentCode?: string;

  @IsString()
  managerId: string;

  @IsString()
  managerName: string;

  @IsString()
  managerInitials: string;

  @IsOptional()
  @IsIn(['Active', 'Inactive'])
  status?: 'Active' | 'Inactive';

  @IsOptional()
  @IsNumber()
  @Min(0)
  headcountSeed?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  permissions?: DepartmentPermissionsDto;
}
