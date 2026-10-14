import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGES,
  PASSWORD_POLICY_PATTERNS,
} from '../../common/validators/password-policy';
import { PASSWORD_RESET_OTP } from '../constants/password-reset-otp.constants';

const IDENTIFIER_MAX = 128;

export type PasswordResetAccountScope = 'fris' | 'admin';

/** Step 1: send OTP using employee ID or email. */
export class SendPasswordResetOtpDto {
  @IsString()
  @IsNotEmpty({ message: 'Employee ID or email is required.' })
  @MaxLength(IDENTIFIER_MAX)
  employeeId!: string;

  @IsOptional()
  @IsIn(['fris', 'admin'])
  accountScope?: PasswordResetAccountScope;
}

/** Step 2: verify OTP before password fields open. */
export class VerifyPasswordResetOtpOnlyDto {
  @IsString()
  @IsNotEmpty({ message: 'Employee ID or email is required.' })
  @MaxLength(IDENTIFIER_MAX)
  employeeId!: string;

  @IsOptional()
  @IsIn(['fris', 'admin'])
  accountScope?: PasswordResetAccountScope;

  @IsString()
  @IsNotEmpty({ message: 'OTP is required.' })
  @Length(PASSWORD_RESET_OTP.LENGTH, PASSWORD_RESET_OTP.LENGTH, {
    message: `OTP must be ${PASSWORD_RESET_OTP.LENGTH} digits.`,
  })
  @Matches(/^\d+$/, { message: 'OTP must be numeric.' })
  otp!: string;
}

/** Step 3: set new password after OTP verified. */
export class VerifyPasswordResetOtpDto {
  @IsString()
  @IsNotEmpty({ message: 'Employee ID or email is required.' })
  @MaxLength(IDENTIFIER_MAX)
  employeeId!: string;

  @IsOptional()
  @IsIn(['fris', 'admin'])
  accountScope?: PasswordResetAccountScope;

  @IsString({ message: PASSWORD_POLICY_MESSAGES.string })
  @IsNotEmpty({ message: PASSWORD_POLICY_MESSAGES.required })
  @ValidateIf((_, value) => typeof value === 'string' && value.trim().length > 0)
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: PASSWORD_POLICY_MESSAGES.minLength,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: PASSWORD_POLICY_MESSAGES.maxLength,
  })
  @Matches(PASSWORD_POLICY_PATTERNS.uppercase, {
    message: PASSWORD_POLICY_MESSAGES.uppercase,
  })
  @Matches(PASSWORD_POLICY_PATTERNS.lowercase, {
    message: PASSWORD_POLICY_MESSAGES.lowercase,
  })
  @Matches(PASSWORD_POLICY_PATTERNS.number, {
    message: PASSWORD_POLICY_MESSAGES.number,
  })
  @Matches(PASSWORD_POLICY_PATTERNS.special, {
    message: PASSWORD_POLICY_MESSAGES.special,
  })
  newPassword!: string;

  @IsString()
  @IsNotEmpty({ message: 'Confirm password is required.' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  confirmPassword!: string;
}
