import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ResolveSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  resolutionNote: string;
}
