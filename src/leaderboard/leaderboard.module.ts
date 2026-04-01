import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { UsersModule } from '../users/users.module';
import { AdminLeaderboardController } from './admin-leaderboard.controller';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserQuestionAttempt]), UsersModule],
  controllers: [LeaderboardController, AdminLeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}

