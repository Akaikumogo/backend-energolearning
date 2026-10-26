import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class OptionDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsBoolean()
  isCorrect: boolean;
}

export class UpsertQuestionDto {
  @IsString()
  @MinLength(1)
  prompt: string;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsIn(['SINGLE', 'MULTIPLE'])
  type: 'SINGLE' | 'MULTIPLE';

  @IsString()
  @MinLength(1)
  subject: string;

  @IsString()
  @MinLength(1)
  category: string;

  @IsOptional()
  @IsIn(['EASY', 'MEDIUM', 'HARD'])
  difficulty?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  explanation?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options: OptionDto[];
}

export class CategoryPlanDto {
  @IsString()
  category: string;

  @IsInt()
  @Min(0)
  count: number;
}

export class GradeThresholdDto {
  @IsInt()
  @Min(0)
  minPercent: number;

  @IsString()
  label: string;
}

export class NextExamRuleDto {
  @IsIn(['months', 'review'])
  kind: 'months' | 'review';

  @IsOptional()
  @IsInt()
  @Min(1)
  months?: number;
}

export class UpsertStandardDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsInt()
  @Min(1)
  durationMs: number;

  @IsInt()
  @Min(1)
  passPercent: number;

  @IsOptional()
  @IsBoolean()
  randomizeQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  randomizeOptions?: boolean;

  @IsInt()
  @Min(1)
  maxRecordingMb: number;

  @IsInt()
  @Min(1)
  totalQuestions: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryPlanDto)
  categoryPlan?: CategoryPlanDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NextExamRuleDto)
  nextExamRule?: NextExamRuleDto | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeThresholdDto)
  gradeThresholds?: GradeThresholdDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  retryMaxAttempts?: number;

  @IsOptional()
  @IsBoolean()
  recordingRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  questionIds?: string[];
}

export class UpdatePolicyDto {
  @IsBoolean()
  requiresExamRoom: boolean;

  @IsString()
  cutoffDate: string;
}

export class CreateRoomDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  safetyRecordId: string;

  @IsUUID()
  standardId: string;

  @IsISO8601()
  scheduledAt: string;

  @IsISO8601()
  expiresAt: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  moderatorIds?: string[];
}

export class EnterRoomDto {
  @IsString()
  @MinLength(16)
  token: string;
}

export class SaveAnswerDto {
  @IsUUID()
  attemptQuestionId: string;

  @IsArray()
  @IsUUID('4', { each: true })
  selectedOptionIds: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  questionIndex?: number;
}

export class HeartbeatDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  questionIndex?: number;

  @IsOptional()
  @IsBoolean()
  camera?: boolean;

  @IsOptional()
  @IsBoolean()
  microphone?: boolean;

  @IsOptional()
  @IsBoolean()
  recording?: boolean;
}

export class EventItemDto {
  @IsString()
  @MinLength(4)
  clientEventId: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsISO8601()
  occurredAt: string;
}

export class EventsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventItemDto)
  events: EventItemDto[];
}

export class InterruptDto {
  @IsOptional()
  @IsISO8601()
  frozenAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  questionIndex?: number;
}

export class SightingDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class SightingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SightingDto)
  sightings: SightingDto[];
}

export class RecordingChunkDto {
  @IsIn(['screen', 'camera', 'mic', 'system_audio'])
  kind: 'screen' | 'camera' | 'mic' | 'system_audio';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence: number;

  @IsOptional()
  @IsString()
  checksum?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMs?: number;
}
