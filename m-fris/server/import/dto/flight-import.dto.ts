import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import {
  CATEGORY_VALUES,
  FLIGHT_NO_REGEX,
  OPS_TYPE_VALUES,
  ROUTING_REGEX,
  SERIAL_NO_REGEX,
  TIME_REGEX,
  YN_VALUES,
} from '../constants/flight-import.constants';

function trimUpper(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function trimValue(value: unknown): string {
  return String(value ?? '').trim();
}

export class FlightImportDto {
  @IsString()
  @IsNotEmpty({ message: 'airline is required' })
  @Transform(({ value }) => trimValue(value))
  airline!: string;

  @IsString()
  @IsNotEmpty({ message: 'flightNo is required' })
  @Transform(({ value }) => trimUpper(value))
  @Matches(FLIGHT_NO_REGEX, {
    message: 'flightNo must match pattern AA-123, AA123, or AA123/AA456',
  })
  flightNo!: string;

  @IsString()
  @IsNotEmpty({ message: 'serialNo is required' })
  @Transform(({ value }) => trimValue(value))
  @Matches(SERIAL_NO_REGEX, { message: 'serialNo must be a 6-digit value' })
  serialNo!: string;

  @IsString()
  @IsNotEmpty({ message: 'acType is required' })
  @Transform(({ value }) => trimValue(value))
  acType!: string;

  @IsString()
  @IsNotEmpty({ message: 'routing is required' })
  @Transform(({ value }) => trimUpper(value))
  @Matches(ROUTING_REGEX, {
    message: 'routing must be in AAA-BBB airport format',
  })
  routing!: string;

  @IsString()
  @IsNotEmpty({ message: 'staTime is required' })
  @Transform(({ value }) => trimValue(value))
  @Matches(TIME_REGEX, { message: 'staTime must be HH:mm (24h)' })
  staTime!: string;

  @IsString()
  @IsNotEmpty({ message: 'aBody is required' })
  @Transform(({ value }) => trimUpper(value))
  @IsIn([...YN_VALUES], { message: 'aBody must be Y or N' })
  aBody!: string;

  @IsString()
  @IsNotEmpty({ message: 'stdTime is required' })
  @Transform(({ value }) => trimValue(value))
  @Matches(TIME_REGEX, { message: 'stdTime must be HH:mm (24h)' })
  stdTime!: string;

  @IsString()
  @IsNotEmpty({ message: 'opsType is required' })
  @Transform(({ value }) => trimValue(value))
  @IsIn([...OPS_TYPE_VALUES], {
    message: `opsType must be one of: ${OPS_TYPE_VALUES.join(', ')}`,
  })
  opsType!: string;

  @IsString()
  @IsNotEmpty({ message: 'skdNsnkdr is required' })
  @Transform(({ value }) => trimValue(value))
  skdNsnkdr!: string;

  @IsString()
  @IsNotEmpty({ message: 'airlineCode is required' })
  @Transform(({ value }) => trimUpper(value))
  airlineCode!: string;

  @IsString()
  @IsNotEmpty({ message: 'freighter is required' })
  @Transform(({ value }) => trimUpper(value))
  @IsIn([...YN_VALUES], { message: 'freighter must be Y or N' })
  freighter!: string;

  @IsString()
  @IsNotEmpty({ message: 'date is required' })
  @Transform(({ value }) => trimValue(value))
  date!: string;

  @IsString()
  @IsNotEmpty({ message: 'date2 is required' })
  @Transform(({ value }) => trimValue(value))
  date2!: string;

  @IsString()
  @IsNotEmpty({ message: 'category is required' })
  @Transform(({ value }) => trimValue(value))
  @IsIn([...CATEGORY_VALUES], {
    message: `category must be one of: ${CATEGORY_VALUES.join(', ')}`,
  })
  category!: string;
}
