import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { UploadController } from './upload.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UploadController],
})
export class UploadModule {}
