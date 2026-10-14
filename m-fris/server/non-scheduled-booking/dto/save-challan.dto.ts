import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Challan form fields — challan number is allocated on save. */
export class SaveChallanDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  challanDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9]*$/, {
    message: 'Bay No may only contain letters and numbers.',
  })
  bayNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\d*$/, {
    message: 'Ferry issued may only contain numbers.',
  })
  noOfFerryIssued?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9]*$/, {
    message: 'No of Pax may only contain letters and numbers.',
  })
  noOfPax?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^(?:[A-Za-z]+(?: [A-Za-z]+)*)?$/, {
    message: 'GH Representative may only contain letters.',
  })
  ghRepresentative?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^(?:[A-Za-z]+(?: [A-Za-z]+)*)?$/, {
    message: 'Airline Representative may only contain letters.',
  })
  airlineRepresentative?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
