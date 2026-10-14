import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class QueryFlightSerialsDto {
  @IsArray()
  @ArrayMinSize(0)
  @IsString({ each: true })
  flightSerials: string[];
}
