import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PassengerNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;
}

/** Replace passenger list on a booking that already has a challan. */
export class SavePassengersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PassengerNameDto)
  passengers: PassengerNameDto[];

  /** When true, append to existing names instead of replacing. */
  @IsOptional()
  @IsBoolean()
  append?: boolean;
}
