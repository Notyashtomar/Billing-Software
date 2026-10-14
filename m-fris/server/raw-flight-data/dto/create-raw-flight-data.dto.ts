import { IsArray, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRawFlightDataDto {
  @IsObject()
  data: Record<string, any>;
}

export class BulkCreateRawFlightDataDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRawFlightDataDto)
  flights: CreateRawFlightDataDto[];
}
