import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateRampDetails2Dto {
  // @IsNumber()
  // serialNo: number;

  @IsOptional()
  @IsString()
  chooseEmployee?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  dutyAllocation?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsString()
  aircraft?: string;

  @IsOptional()
  @IsString()
  staTime?: string;

  @IsOptional()
  @IsString()
  routing?: string;

  @IsOptional()
  @IsString()
  atdDate?: string;

  @IsOptional()
  @IsString()
  airline?: string;

  @IsOptional()
  @IsString()
  operation?: string;

  @IsOptional()
  @IsString()
  stdDate?: string;

  @IsOptional()
  @IsString()
  ataDate?: string;

  @IsOptional()
  @IsString()
  atdTime?: string;

  @IsOptional()
  @IsString()
  flightNo?: string;

  @IsOptional()
  @IsString()
  staDate?: string;

  @IsOptional()
  @IsString()
  stdTime?: string;

  @IsOptional()
  @IsString()
  ataTime?: string;
}
