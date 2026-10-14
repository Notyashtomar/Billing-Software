import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  normalizePasswordInput,
  PASSWORD_POLICY_MESSAGES,
} from '../../common/validators/password-policy';

export class UpdatePanelUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEmail()
  companyEmail?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : normalizePasswordInput(value),
  )
  @IsString({ message: PASSWORD_POLICY_MESSAGES.string })
  password?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return value;
    const role = String(value).trim().toLowerCase();
    if (role === 'admin' || role === 'operations') return 'manager';
    return role;
  })
  @IsString()
  @IsIn(['superadmin', 'manager', 'employee'])
  role?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  dob?: string;

  @IsOptional()
  @IsString()
  fatherName?: string;

  @IsOptional()
  @IsString()
  motherName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  residence?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  joiningDate?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  subDepartment?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  station?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedStationIds?: string[];

  @IsOptional()
  @IsObject()
  stationPermissions?: Record<
    string,
    {
      accessTabs: string[];
      accessSubPages: Record<string, string[]>;
    }
  >;

  @IsOptional()
  @IsObject()
  stationAppAccess?: Record<string, string[]>;

  @IsOptional()
  @IsObject()
  stationAppPageAccess?: Record<string, Record<string, string[]>>;

  @IsOptional()
  @IsString()
  locations?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsObject()
  permissions?: {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adminPanelSections?: string[];
}
