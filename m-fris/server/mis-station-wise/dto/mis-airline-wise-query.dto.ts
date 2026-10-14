import { IsOptional, IsString, Matches } from 'class-validator';
import { MisStationWiseQueryDto } from './mis-station-wise-query.dto';

export class MisAirlineWiseQueryDto extends MisStationWiseQueryDto {
  /** IATA / FHR code for one-airline workbook (6E_MONTHWISE_2025). */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{2,5}$/)
  airlineCode?: string;
}
