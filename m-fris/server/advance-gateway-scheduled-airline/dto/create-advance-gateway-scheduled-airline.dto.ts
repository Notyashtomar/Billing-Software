import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const filled = (_: unknown, value: unknown) =>
  value != null && String(value).trim() !== '';

export class CreateAdvanceGatewayScheduledAirlineDto {
  @IsOptional()
  @IsString()
  airlines?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  typeOfAirline?: string;

  @IsOptional()
  @IsString()
  @ValidateIf(filled)
  @MinLength(5)
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsString()
  @ValidateIf(filled)
  @MinLength(5)
  @MaxLength(250)
  address2?: string;

  @IsOptional()
  @IsString()
  @ValidateIf(filled)
  @Matches(/^(?:[0-9]|[1-9][0-9]|[1-2][0-9]{2}|3[0-5][0-9]|36[0-5])$/, {
    message: 'Reminder for invoicing must be a whole number of days from 0 to 365.',
  })
  reminderForInvoicing?: string;

  @IsOptional()
  @IsString()
  agreementValidFrom?: string;

  @IsOptional()
  @IsString()
  agreementValidTo?: string;

  @IsOptional()
  @IsString()
  @ValidateIf(filled)
  @MaxLength(500)
  @Matches(
    /^[^\s@,]+@[^\s@,]+\.[^\s@,]+(?:\s*,\s*[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$/,
    { message: 'Email ID must be one or more valid addresses, separated by commas.' },
  )
  emailId?: string;

  @IsOptional()
  @IsBoolean()
  changeScheduledEnable?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsBoolean()
  linkAircraftRegistrationWithType?: boolean;

  @IsOptional()
  @IsBoolean()
  engineerReport?: boolean;

  @IsOptional()
  @IsBoolean()
  deepCleaning?: boolean;

  @IsOptional()
  @IsBoolean()
  nightHaltCleaning?: boolean;

  @IsOptional()
  @IsBoolean()
  exteriorCleaning?: boolean;

  @IsOptional()
  @IsString()
  dcsName?: string;

  @IsOptional()
  @IsString()
  handlingType?: string;

  @IsOptional()
  @IsBoolean()
  wheelchairService?: boolean;
}
