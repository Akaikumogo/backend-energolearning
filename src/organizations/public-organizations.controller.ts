import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';

@ApiTags('Public')
@Controller('public')
export class PublicOrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  @Get('organizations')
  @ApiOperation({ summary: 'Tashkilotlar ro`yxati (ochiq)' })
  @ApiOkResponse({ description: 'id va nom' })
  listOrganizations(): Promise<{ id: string; name: string }[]> {
    return this.orgService.listPublicNames();
  }
}
