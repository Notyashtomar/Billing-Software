import {
  IsEmail,
  IsNotEmpty,
  IsString,
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

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;

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
  newPassword: string;
}
