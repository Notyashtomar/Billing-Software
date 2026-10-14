import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateUserInviteDto {
  @IsEmail()
  email: string;

  @IsIn(['employee'])
  invitedRole: string;

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
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInHours?: number;

  @IsOptional()
  @IsObject()
  permissionPreset?: {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  };
}

export class BulkCreateUserInvitesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  emails: string[];

  @IsIn(['employee'])
  invitedRole: string;

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
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInHours?: number;

  @IsOptional()
  @IsObject()
  permissionPreset?: {
    accessTabs: string[];
    accessSubPages: Record<string, string[]>;
  };
}

export class ResendUserInviteDto {
  @IsString()
  @IsNotEmpty()
  inviteId: string;
}

export class RemoveUserInviteDto {
  @IsString()
  @IsNotEmpty()
  inviteId: string;
}

export class ApproveRegisteredUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** When true, email the employee their FRIS user ID and login password. */
  @IsOptional()
  @IsBoolean()
  sendCredentials?: boolean;
}

export class RejectRegisteredUserDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
