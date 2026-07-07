import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { QuestionPosition } from '../database/entities/question-position.entity';
import { Position } from '../database/entities/position.entity';
import { ContentController } from './content.controller';
import { MobileContentController } from './mobile-content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Level,
      Theory,
      Question,
      QuestionOption,
      QuestionPosition,
      Position,
    ]),
  ],
  controllers: [ContentController, MobileContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
