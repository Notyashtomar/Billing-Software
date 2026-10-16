import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SendUniversalNotificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  /** `all` = every active user; `custom` = only `userIds`. */
  @IsOptional()
  @IsIn(['all', 'custom'])
  audience?: 'all' | 'custom';

  @ValidateIf((o: SendUniversalNotificationDto) => o.audience === 'custom')
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  userIds?: string[];
}
