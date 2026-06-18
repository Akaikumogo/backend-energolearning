import { Module } from '@nestjs/common';
import { AdminScriptsController } from './admin-scripts.controller';
import { AdminScriptsService } from './admin-scripts.service';

@Module({
  controllers: [AdminScriptsController],
  providers: [AdminScriptsService],
})
export class AdminScriptsModule {}
