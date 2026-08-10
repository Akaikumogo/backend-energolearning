import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';

/**
 * QR kod orqali ochiladigan tekshiruv — autentifikatsiya talab qilinmaydi.
 * Shu sababli faqat minimal ma'lumot qaytariladi (login, email yo'q).
 */
@ApiTags('Certificates')
@Controller('public')
export class CertificatesPublicController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('certificates/verify/:number')
  @ApiOperation({ summary: 'Guvohnoma haqiqiyligini tekshirish (ochiq)' })
  @ApiParam({ name: 'number', description: 'Guvohnoma raqami, masalan BU0001' })
  @ApiOkResponse({ description: 'Guvohnoma holati' })
  verify(@Param('number') certificateNumber: string) {
    return this.certificatesService.verifyByNumber(certificateNumber);
  }

  @Get('id-card/:id')
  @ApiOperation({
    summary: 'ENERGO ID guvohnomasini QR orqali tekshirish (ochiq)',
  })
  @ApiParam({ name: 'id', description: 'ENERGO ID user id yoki ElektroLearn user id' })
  @ApiOkResponse({ description: 'Xodim guvohnomasi' })
  idCard(@Param('id') id: string) {
    return this.certificatesService.getPublicIdCard(id);
  }
}
