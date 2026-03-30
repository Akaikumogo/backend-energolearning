import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Level, Theory, Question, QuestionOption])],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
