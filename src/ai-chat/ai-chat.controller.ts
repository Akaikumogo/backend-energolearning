import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AiChatService } from './ai-chat.service';

type Authed = Request & {
  user: { id: string; role: Role; organizationIds?: string[] };
};

@ApiTags('AI Chat')
@Controller('ai-chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Get('status')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.APPROVER, Role.USER)
  @ApiOperation({ summary: 'AI doirasi va holati' })
  status(@Req() req: Authed) {
    return this.aiChatService.getProviderStatus(
      req.user.id,
      req.user.role,
      req.user.organizationIds,
    );
  }

  @Get('out-of-scope')
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.APPROVER)
  @ApiOperation({ summary: 'Platformadan tashqari savollar jurnali' })
  outOfScope(@Req() req: Authed) {
    return this.aiChatService.listOutOfScope(
      req.user.id,
      req.user.role,
      req.user.organizationIds,
    );
  }
}
