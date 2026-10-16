import { IsIn, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  MESSAGING_MODULES,
} from '../constants/messaging.enums';

export class QueryMessagingDto {
  @IsOptional()
  @IsString()
  datePreset?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsIn([...MESSAGE_TYPES])
  messageType?: string;

  @IsOptional()
  @IsIn([...MESSAGE_STATUSES, 'success', 'pending', 'retrying'])
  status?: string;

  @IsOptional()
  @IsIn([...MESSAGING_MODULES])
  module?: string;

  @IsOptional()
  @IsString()
  recipient?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TestEmailDto {
  @IsOptional()
  @IsString()
  toEmail?: string;
}

export class TestOtpDto {
  @IsOptional()
  @IsString()
  toEmail?: string;
}
