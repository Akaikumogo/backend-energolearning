import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class PromoteSuperAdminDto {
  @ApiProperty({ description: 'Mavjud xodim (USER yoki MODERATOR) user id' })
  @IsUUID()
  userId: string;
}
