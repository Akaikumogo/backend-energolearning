import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { RunOneTimeCutoverDto } from './dto/run-one-time-cutover.dto';
import { OneTimeCutoverGuard } from './one-time-cutover.guard';
import { OneTimeCutoverService } from './one-time-cutover.service';

@ApiTags('One-time Cutover (bir marta, keyin yopiladi)')
@Controller('admin/one-time/energo-id-cutover')
@UseGuards(JwtAuthGuard, RolesGuard, OneTimeCutoverGuard)
@Roles(Role.SUPERADMIN)
@ApiBearerAuth('bearer')
export class OneTimeCutoverController {
  constructor(private readonly cutoverService: OneTimeCutoverService) {}

  @Post()
  @ApiOperation({
    summary: 'Energo ID fresh-start cutover (FAQAT BIR MARTA)',
    description:
      'Barcha USER xodimlar va runtime ma’lumotlarni tozalaydi. ' +
      'Muvaffaqiyatdan keyin flag fayl yoziladi — endpoint 404 qaytaradi va ' +
      'backend restart dan keyin Swagger dan ham yo‘qoladi. ' +
      'ONE_TIME_CUTOVER_ENABLED=true va ONE_TIME_CUTOVER_TOKEN kerak.',
  })
  @ApiOkResponse({ description: 'Cutover natijasi (stdout/stderr)' })
  run(@Body() dto: RunOneTimeCutoverDto) {
    return this.cutoverService.run(dto.token);
  }
}
