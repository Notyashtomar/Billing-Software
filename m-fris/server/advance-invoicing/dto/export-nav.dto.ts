import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ExportNavDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  serialNos: string[];
}
