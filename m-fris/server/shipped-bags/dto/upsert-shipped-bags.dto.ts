import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class ShippedBagRowDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  optionSection: string;

  @IsString()
  remarks: string;
}

export class UpsertShippedBagsDto {
  @IsString()
  @IsNotEmpty()
  flightSerial: string;

  @IsString()
  noOfBags: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShippedBagRowDto)
  rows: ShippedBagRowDto[];
}
