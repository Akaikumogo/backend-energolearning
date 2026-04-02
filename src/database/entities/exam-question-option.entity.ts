import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExamQuestion } from './exam-question.entity';

@Entity({ name: 'exam_question_options' })
export class ExamQuestionOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ExamQuestion, (q) => q.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: ExamQuestion;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @Column({ type: 'text', name: 'option_text' })
  optionText: string;

  @Column({ type: 'int', name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ type: 'boolean', name: 'is_correct', default: false })
  isCorrect: boolean;

  @Column({ type: 'text', name: 'match_text', nullable: true })
  matchText: string | null;
}

