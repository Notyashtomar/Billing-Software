import { IsBoolean, IsEnum, IsOptional, IsString, IsArray, ArrayMinSize } from 'class-validator';

export class CreateServiceCatalogDto {
  @IsString()
  serviceCode: string;

  @IsString()
  description: string;

  @IsString()
  category: string;

  @IsString()
  uom: string;

  @IsOptional()
  @IsBoolean()
  royaltyApplicable?: boolean;
}

export class UpdateServiceCatalogDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  uom?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  sacCode?: string;

  @IsOptional()
  @IsBoolean()
  royaltyApplicable?: boolean;
}

export class ListServiceCatalogQueryDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['true', 'false'])
  active?: string;
}

export class BulkDeleteServiceCatalogDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serviceCodes: string[];
}
