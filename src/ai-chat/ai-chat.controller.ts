import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AiChatService } from './ai-chat.service';

@ApiTags('AI Chat')
@Controller('ai-chat')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPERADMIN, Role.MODERATOR, Role.APPROVER, Role.USER)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'AI provider holati' })
  status() {
    return this.aiChatService.getProviderStatus();
  }
}
