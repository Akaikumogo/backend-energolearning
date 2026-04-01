import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CrudDto {
  @ApiProperty()
  @IsBoolean()
  create: boolean;

  @ApiProperty()
  @IsBoolean()
  update: boolean;

  @ApiProperty()
  @IsBoolean()
  delete: boolean;
}

export class ModeratorPermissionsDto {
  @ApiProperty({ type: CrudDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CrudDto)
  contentLevels: CrudDto;

  @ApiProperty({ type: CrudDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CrudDto)
  contentTheories: CrudDto;

  @ApiProperty({ type: CrudDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CrudDto)
  contentQuestions: CrudDto;

  @ApiProperty({ type: CrudDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CrudDto)
  organizations: CrudDto;

  @ApiProperty({ type: CrudDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CrudDto)
  students: CrudDto;

  @ApiProperty({ type: CrudDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CrudDto)
  users: CrudDto;

  @ApiProperty({ type: CrudDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CrudDto)
  moderators: CrudDto;

  @ApiProperty({ type: CrudDto })
  @IsObject()
  @ValidateNested()
  @Type(() => CrudDto)
  profile: CrudDto;
}

export class UpdateModeratorPermissionsDto {
  @ApiProperty({ type: ModeratorPermissionsDto })
  @ValidateNested()
  @Type(() => ModeratorPermissionsDto)
  permissions: ModeratorPermissionsDto;
}

