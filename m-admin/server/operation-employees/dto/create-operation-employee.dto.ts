import { IsString, IsNotEmpty } from 'class-validator';

export class CreateOperationEmployeeDto {
  @IsString()
  @IsNotEmpty()
  employeeName: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
