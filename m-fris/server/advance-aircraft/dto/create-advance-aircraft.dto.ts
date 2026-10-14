import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsIn,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateAdvanceAircraftDto {
  @IsString()
  @IsNotEmpty()
  aircraft: string;

  @IsOptional()
  @IsString()
  aircraftBody?: string;

  @IsOptional()
  @IsString()
  mtow?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  icaoCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Wingspan must be greater than 0.' })
  @Max(200)
  wingspan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999, { message: 'Passenger capacity must be less than 1000.' })
  passengerCapacity?: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['A', 'B', 'C', 'D', 'E'], {
    message: 'Category must be A, B, C, D or E',
  })
  category: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
