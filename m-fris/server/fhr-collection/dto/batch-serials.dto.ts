import { ArrayMaxSize, ArrayNotEmpty, IsInt, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Batch request body: many candidate serials resolved in a single query/pass
 * instead of one HTTP round trip per flight (Scheduled data export page).
 */
export class BatchSerialsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @Type(() => Number)
  @IsInt({ each: true })
  serials!: number[];
}
