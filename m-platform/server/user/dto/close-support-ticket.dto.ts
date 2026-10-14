import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CloseSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  closeComment: string;
}
