import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '../common/enums/role.enum';
import { CertificatesService } from './certificates.service';

/** Xodimning o'z guvohnomalari (mobil ilova). */
@ApiTags('Certificates')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('certificates')
export class CertificatesMeController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Mening guvohnomalarim' })
  @ApiOkResponse({ description: 'Guvohnomalar ro`yxati' })
  listMine(@Req() req: Request & { user: { id: string; role: Role } }) {
    return this.certificatesService.listMine(req.user.id);
  }
}
