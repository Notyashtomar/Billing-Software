import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AppendAdvanceCargoServiceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[A-Za-z]+(?: [A-Za-z]+)*$/, {
    message: 'Service name may only contain letters and spaces.',
  })
  serviceName: string;

  @IsOptional()
  @IsString()
  serviceCode?: string;

  @IsOptional()
  @IsString()
  unitType?: string;

  @IsOptional()
  @IsString()
  quantityNecessary?: string;
}
