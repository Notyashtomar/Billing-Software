import {
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateAdvanceNonScheduledAirlineDto {
  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @Matches(/^[A-Za-z]+(?: [A-Za-z]+)*$/, {
    message: 'Airline may only contain letters and spaces.',
  })
  airline?: string;

  @IsOptional()
  @IsString()
  airlineCode?: string;
}
