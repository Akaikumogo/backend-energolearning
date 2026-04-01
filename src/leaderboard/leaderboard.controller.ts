import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { LeaderboardService } from './leaderboard.service';

@ApiTags('Leaderboard')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('leaderboard')
export class LeaderboardController {
  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly usersService: UsersService,
  ) {}

  @Get('global')
  @ApiOperation({ summary: 'Global reyting (top + men nechinchiman)' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ description: 'Leaderboard response' })
  async global(
    @Req() req: Request & { user: { id: string } },
    @Query('limit') limit?: string,
  ) {
    return this.leaderboardService.getGlobalLeaderboard(
      req.user.id,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('organization')
  @ApiOperation({ summary: 'Organization ichida reyting (top + men nechinchiman)' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiOkResponse({ description: 'Leaderboard response' })
  async organization(
    @Req() req: Request & { user: { id: string } },
    @Query('limit') limit?: string,
  ) {
    const user = await this.usersService.findById(req.user.id);
    const orgId = user?.organizations?.[0]?.organization?.id ?? null;
    if (!orgId) {
      return { scope: 'organization', orgId: null, me: null, top: [] };
    }
    return this.leaderboardService.getOrganizationLeaderboard(
      req.user.id,
      orgId,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}

