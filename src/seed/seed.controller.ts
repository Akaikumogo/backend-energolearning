import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@ApiTags('Seed')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post('content')
  @ApiOperation({
    summary: 'Barcha kurs kontentini DB ga seed qilish',
    description:
      'Auth kerak emas. Mavjud darajalar bo`lsa, qayta seed qilmaydi.',
  })
  async seedContent() {
    return this.seedService.seedAll();
  }
}
