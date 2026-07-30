import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { UploadController } from './upload.controller';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([User])],
  controllers: [UploadController],
})
export class UploadModule {}
