import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { BOOKING_CHANNELS } from '../utils/booking-no.util';

export class CreateNonScheduledBookingDto {
  @IsString()
  @IsIn([...BOOKING_CHANNELS])
  channel: 'mail' | 'direct';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  operator: string;

  @ValidateIf((o: CreateNonScheduledBookingDto) => o.channel === 'mail')
  @IsString()
  @IsNotEmpty({ message: 'mailReceivedFrom is required for By Mail bookings' })
  @MaxLength(200)
  mailReceivedFrom?: string;

  @ValidateIf((o: CreateNonScheduledBookingDto) => o.channel === 'mail')
  @IsString()
  @IsNotEmpty({ message: 'mailReceivedBy is required for By Mail bookings' })
  @MaxLength(200)
  mailReceivedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mailSubject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  bookingDate?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  airlineBillTo: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  airlineCode?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  flightNo: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  registrationNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  routing?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  staDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  staTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  stdDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  stdTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  aircraftType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['NB', 'WB'])
  aircraftBody?: 'NB' | 'WB';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  mtow?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  terminalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  opsType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryOfFlight?: string;

  @IsOptional()
  @IsString()
  @IsIn(['yes', 'no'])
  advance?: 'yes' | 'no';

  @IsOptional()
  @IsString()
  @MaxLength(32)
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(260)
  attachmentName?: string;
}
