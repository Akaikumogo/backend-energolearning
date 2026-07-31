import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { CertificatesService } from './certificates.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';

type AuthedRequest = Request & {
  user: { id: string; role: Role; organizationIds: string[] };
};

@ApiTags('Certificates')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.MODERATOR)
@Controller('admin/certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('employees/:userId')
  @ApiOperation({ summary: 'Xodimning guvohnomalari' })
  @ApiParam({ name: 'userId', description: 'Employee ID' })
  @ApiOkResponse({ description: 'Guvohnomalar ro`yxati' })
  listForEmployee(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.certificatesService.listForUser(userId, req.user);
  }

  @Get('employees/:userId/eligibility')
  @ApiOperation({
    summary: 'Guvohnoma berish mumkinmi (imtihon muvaffaqiyatli yakunlanganmi)',
  })
  @ApiParam({ name: 'userId', description: 'Employee ID' })
  checkEligibility(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.certificatesService.checkEligibility(userId, req.user);
  }

  @Post('employees/:userId')
  @ApiOperation({ summary: 'Xodimga guvohnoma berish' })
  @ApiParam({ name: 'userId', description: 'Employee ID' })
  issue(
    @Req() req: AuthedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: IssueCertificateDto,
  ) {
    return this.certificatesService.issueForUser(userId, req.user, {
      examAttemptId: body.examAttemptId,
    });
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Guvohnomani bekor qilish' })
  @ApiParam({ name: 'id', description: 'Certificate ID' })
  revoke(
    @Req() req: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RevokeCertificateDto,
  ) {
    return this.certificatesService.revoke(id, req.user, body.reason);
  }
}
