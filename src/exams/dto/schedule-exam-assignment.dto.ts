import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class ScheduleExamAssignmentDto {
  @ApiProperty({ example: '2026-04-10T10:00:00.000Z' })
  @IsISO8601()
  scheduledAt: string;
}

