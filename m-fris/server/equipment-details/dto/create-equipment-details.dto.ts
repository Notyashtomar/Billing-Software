import { IsString, IsOptional } from 'class-validator';

export class CreateEquipmentDetailsDto {
  @IsOptional()
  @IsString()
  gsename?: string;

  @IsOptional()
  @IsString()
  gsecode?: string;

  @IsOptional()
  @IsString()
  equipmentcode?: string;

  @IsOptional()
  @IsString()
  empname?: string;

  @IsOptional()
  @IsString()
  empcode?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  fromdate?: string;

  @IsOptional()
  @IsString()
  todate?: string;

  @IsOptional()
  @IsString()
  fromtime?: string;

  @IsOptional()
  @IsString()
  totime?: string;

  // @IsOptional()
  // @IsString()
  // engagetime?: string;
}
