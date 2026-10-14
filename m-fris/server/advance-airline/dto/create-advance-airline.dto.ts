import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAdvanceAirlineDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 5)
  @Matches(/^[A-Za-z0-9]{1,5}$/)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  parentCompanyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address3?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  stateCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstRegistrationNo?: string;
}
