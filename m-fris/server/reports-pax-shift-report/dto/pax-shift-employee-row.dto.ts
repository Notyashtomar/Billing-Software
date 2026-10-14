import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class PaxShiftEmployeeRowDto {
  @IsString()
  id: string;

  @IsString()
  employeeCode: string;

  @IsString()
  employeeName: string;

  @IsOptional()
  @ValidateIf((_, value) => String(value ?? '').trim().length > 0)
  @IsString()
  @Matches(/^[A-Za-z]+(?: [A-Za-z]+)*$/, {
    message: 'Training name may only contain letters.',
  })
  trainingName?: string;

  @IsOptional()
  @IsString()
  trainingDate?: string;
}
