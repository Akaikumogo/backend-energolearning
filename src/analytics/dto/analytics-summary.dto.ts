import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsSummaryDto {
  @ApiProperty({ example: 128, description: 'Jami foydalanuvchilar soni' })
  totalUsers: number;

  @ApiProperty({
    example: 34,
    description: 'Faol foydalanuvchilar (so`nggi 7 kunda)',
  })
  activeUsers7d: number;

  @ApiProperty({ example: 5, description: 'Jami tashkilotlar soni' })
  totalOrganizations: number;

  @ApiProperty({ example: 12, description: 'Moderatorlar soni' })
  totalModerators: number;

  @ApiProperty({ example: 5, description: 'Jami darajalar soni' })
  totalLevels: number;

  @ApiProperty({ example: 20, description: 'Jami savollar soni' })
  totalQuestions: number;

  @ApiProperty({ example: 'all', description: 'Org filter' })
  orgId: string;
}

export class LevelFunnelItemDto {
  @ApiProperty() levelId: string;
  @ApiProperty() levelTitle: string;
  @ApiProperty() orderIndex: number;
  @ApiProperty() totalStarted: number;
  @ApiProperty() totalCompleted: number;
}

export class QuestionErrorDto {
  @ApiProperty() questionId: string;
  @ApiProperty() prompt: string;
  @ApiProperty() levelTitle: string;
  @ApiProperty() theoryTitle: string;
  @ApiProperty() totalAttempts: number;
  @ApiProperty() wrongAttempts: number;
  @ApiProperty() errorRate: number;
}
