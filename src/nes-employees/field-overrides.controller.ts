import {
  Body,
  Controller,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { ModeratorPermissionsGuard } from '../common/guards/moderator-permissions.guard';
import { NesEmployeesService } from './nes-employees.service';

type AuthedRequest = Request & {
  user: { id: string; role: Role };
};

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

class PatchEmployeeFieldsBody {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1, { message: 'Ism bo‘sh bo‘lishi mumkin emas' })
  firstName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1, { message: 'Familiya bo‘sh bo‘lishi mumkin emas' })
  lastName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1, { message: 'Otasining ismi bo‘sh bo‘lishi mumkin emas' })
  middleName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1, { message: 'Bo‘lim bo‘sh bo‘lishi mumkin emas' })
  division?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1, { message: 'Lavozim bo‘sh bo‘lishi mumkin emas' })
  post?: string;
}

class PatchCatalogFieldBody {
  @IsString()
  @MinLength(1)
  sourceName: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1, { message: 'Katalog nomi bo‘sh bo‘lishi mumkin emas' })
  name?: string;
}

@ApiTags('Field overrides')
@Controller('admin/field-overrides')
@UseGuards(JwtAuthGuard, RolesGuard, ModeratorPermissionsGuard)
@ApiBearerAuth('bearer')
export class FieldOverridesController {
  constructor(private readonly nesEmployeesService: NesEmployeesService) {}

  @Patch('employees/:userId')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Xodim display maydonlarini Energo ID orqali yangilash' })
  patchEmployee(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() body: PatchEmployeeFieldsBody,
  ) {
    return this.nesEmployeesService.patchEmployeeFields(
      userId,
      body,
      req.user.id,
    );
  }

  @Patch('departments')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Bo`lim katalog nomini Energo ID orqali yangilash' })
  patchDepartment(@Req() req: AuthedRequest, @Body() body: PatchCatalogFieldBody) {
    return this.nesEmployeesService.patchCatalogField(
      'department',
      body.sourceName,
      body.name ?? null,
      req.user.id,
    );
  }

  @Patch('positions')
  @Roles(Role.SUPERADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Lavozim katalog nomini Energo ID orqali yangilash' })
  patchPosition(@Req() req: AuthedRequest, @Body() body: PatchCatalogFieldBody) {
    return this.nesEmployeesService.patchCatalogField(
      'position',
      body.sourceName,
      body.name ?? null,
      req.user.id,
    );
  }
}
