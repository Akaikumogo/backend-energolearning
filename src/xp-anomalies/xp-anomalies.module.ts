import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { XpAnomaliesController } from './xp-anomalies.controller';
import { XpAnomaliesService } from './xp-anomalies.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserQuestionAttempt])],
  controllers: [XpAnomaliesController],
  providers: [XpAnomaliesService],
})
export class XpAnomaliesModule {}
