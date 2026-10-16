import { IsIn, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from '../constants/incident.enums';

export class QueryIncidentsDto {
  @IsOptional()
  @IsString()
  datePreset?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  station?: string;

  @IsOptional()
  @IsIn([...INCIDENT_CATEGORIES])
  category?: string;

  @IsOptional()
  @IsIn([...INCIDENT_SEVERITIES])
  severity?: string;

  @IsOptional()
  @IsIn([...INCIDENT_STATUSES])
  status?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  reportedBy?: string;

  @IsOptional()
  @IsString()
  incidentId?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateIncidentDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsIn([...INCIDENT_CATEGORIES])
  category!: string;

  @IsIn([...INCIDENT_SEVERITIES])
  severity!: string;

  @IsOptional()
  @IsString()
  station?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  affectedArea?: string;

  @IsOptional()
  @IsString()
  affectedSystem?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsIn([...INCIDENT_STATUSES])
  status?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  escalatedTo?: string;

  @IsOptional()
  @IsString()
  rootCause?: string;

  @IsOptional()
  @IsString()
  resolutionSummary?: string;

  @IsOptional()
  @IsIn([...INCIDENT_SEVERITIES])
  severity?: string;
}

export class AddIncidentCommentDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString({ each: true })
  mentions?: string[];
}
