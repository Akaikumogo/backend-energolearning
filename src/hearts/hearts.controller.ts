import { Controller, Get, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Observable, concat, from, map, of } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HeartsEvents, type HeartsState } from './hearts.events';
import { HeartsService } from './hearts.service';

@ApiTags('Hearts')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('hearts')
export class HeartsController {
  constructor(
    private readonly heartsService: HeartsService,
    private readonly heartsEvents: HeartsEvents,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Joriy foydalanuvchi heart holati (backend regen bilan)' })
  @ApiOkResponse({ description: 'heartsCount/maxHearts/nextRegenAt' })
  async me(@Req() req: Request & { user: { id: string; organizationIds: string[] } }) {
    const orgId = req.user.organizationIds?.[0];
    if (!orgId) {
      return { heartsCount: 0, maxHearts: 5, nextRegenAt: null, lastHeartRegenAt: null };
    }
    return this.heartsService.getMyHearts(req.user.id, orgId);
  }

  @Sse('me/stream')
  @ApiOperation({ summary: 'Heart real-time stream (SSE)' })
  sse(
    @Req() req: Request & { user: { id: string; organizationIds: string[] } },
  ): Observable<{ data: HeartsState }> {
    const userId = req.user.id;
    const orgId = req.user.organizationIds?.[0];

    const initial$ = orgId
      ? from(this.heartsService.getMyHearts(userId, orgId)).pipe(
          map((state) => ({ data: state })),
        )
      : of({
          data: {
            heartsCount: 0,
            maxHearts: 5,
            nextRegenAt: null,
            lastHeartRegenAt: null,
          },
        });

    const updates$ = this.heartsEvents
      .stream(userId)
      .pipe(map((state) => ({ data: state })));

    return concat(initial$, updates$);
  }
}

