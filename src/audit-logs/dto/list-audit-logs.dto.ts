import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListAuditLogsDto {
  @ApiPropertyOptional({ enum: ['today', 'month', 'year'], default: 'today' })
  range?: 'today' | 'month' | 'year';

  @ApiPropertyOptional({ description: 'Filter by actor user id (uuid)' })
  actorId?: string;

  @ApiPropertyOptional({
  description: 'Filter by organization id contained in actorOrganizationIds',
  })
  orgId?: string;

  @ApiPropertyOptional({ description: 'HTTP status code filter', example: 403 })
  statusCode?: number;

  @ApiPropertyOptional({ example: 1 })
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  limit?: number;
}

