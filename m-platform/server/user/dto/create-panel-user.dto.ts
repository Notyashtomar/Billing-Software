import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  normalizePasswordInput,
  PASSWORD_POLICY_MESSAGES,
} from '../../common/validators/password-policy';

export class CreatePanelUserDto {
  @IsString()
  @IsNotEmpty()
  userid: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsEmail()
  companyEmail?: string;

  @Transform(({ value }) => normalizePasswordInput(value))
  @IsString({ message: PASSWORD_POLICY_MESSAGES.string })
  @IsNotEmpty({ message: PASSWORD_POLICY_MESSAGES.required })
  password: string;

  @Transform(({ value }) => {
    const role = String(value ?? '').trim().toLowerCase();
    if (role === 'admin' || role === 'operations') return 'manager';
    return role;
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['superadmin', 'manager', 'employee'])
  role: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

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

  @IsString()
  @IsNotEmpty()
  department: string;

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

  @IsObject()
  permissions: {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adminPanelSections?: string[];
}
