import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AppendAdvanceCargoUnitMasterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^(?=.*[A-Za-z]).+$/, {
    message: 'Unit name must include letters. Numbers or symbols alone are not allowed.',
  })
  unitName: string;

  @IsOptional()
  @IsString()
  unitCode?: string;

  @IsOptional()
  @IsString()
  unitFormat?: string;
}
