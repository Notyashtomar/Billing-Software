import { IsArray, IsString } from 'class-validator';

export class QueryShippedBagsDto {
  @IsArray()
  @IsString({ each: true })
  flightSerials: string[];
}
