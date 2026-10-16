import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class StationPermissionsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  accessTabs?: string[];

  @IsOptional()
  @IsObject()
  accessSubPages?: Record<string, string[]>;
}

export class CreateAdminStationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  company: string;

  @IsString()
  region: string;

  @IsString()
  city: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  addressCity?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  gstNumber?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  terminals?: string[];

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsIn(['Airport', 'Cargo', 'Rail', 'Warehouse', 'Ops Hub'])
  type?: string;

  @IsString()
  manager: string;

  @IsNumber()
  @Min(0)
  capacity: number;

  @IsIn(['Active', 'Maintenance', 'Delayed', 'Offline'])
  status: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNumber()
  @Min(0)
  activeStaff: number;

  @IsNumber()
  @Min(0)
  departmentCount: number;

  @IsOptional()
  permissions?: StationPermissionsDto;
}
