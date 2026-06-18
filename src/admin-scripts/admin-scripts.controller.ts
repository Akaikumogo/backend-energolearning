import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminScriptsService } from './admin-scripts.service';
import { RunScriptDto } from './dto/run-script.dto';

@ApiTags('Admin Scripts (SuperAdmin)')
@Controller('admin/scripts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('bearer')
export class AdminScriptsController {
  constructor(private readonly scriptsService: AdminScriptsService) {}

  @Get()
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'scripts/ folderdagi ishga tushiriladigan skriptlar' })
  @ApiOkResponse({ description: 'Script fayl nomlari ro`yxati' })
  list() {
    return { scripts: this.scriptsService.listScripts() };
  }

  @Post('run')
  @Roles(Role.SUPERADMIN)
  @ApiOperation({ summary: 'Server-side scriptni ishga tushirish (SuperAdmin)' })
  @ApiBody({ type: RunScriptDto })
  @ApiOkResponse({ description: 'Script natijasi (stdout/stderr/exitCode)' })
  async run(@Body() dto: RunScriptDto) {
    return this.scriptsService.runScript(dto.script, dto.env);
  }
}
