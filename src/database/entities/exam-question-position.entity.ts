import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { ExamQuestion } from './exam-question.entity';
import { Position } from './position.entity';

@Entity({ name: 'exam_question_positions' })
@Unique('uq_exam_question_position', ['questionId', 'positionId'])
export class ExamQuestionPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ExamQuestion, (q) => q.positionLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: ExamQuestion;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @ManyToOne(() => Position, (p) => p.examQuestionLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position;

  @Column({ type: 'uuid', name: 'position_id' })
  positionId: string;
}

