import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExamQuestionSection } from '../../common/enums/exam-question-section.enum';
import { ExamAttempt } from './exam-attempt.entity';
import { ExamQuestion } from './exam-question.entity';
import { ExamQuestionOption } from './exam-question-option.entity';

@Entity({ name: 'exam_attempt_answers' })
export class ExamAttemptAnswer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ExamAttempt, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attempt_id' })
  attempt: ExamAttempt;

  @Column({ type: 'uuid', name: 'attempt_id' })
  attemptId: string;

  @ManyToOne(() => ExamQuestion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: ExamQuestion;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @Column({ type: 'text' })
  section: ExamQuestionSection;

  @ManyToOne(() => ExamQuestionOption, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'selected_option_id' })
  selectedOption: ExamQuestionOption | null;

  @Column({ type: 'uuid', name: 'selected_option_id', nullable: true })
  selectedOptionId: string | null;

  @Column({ type: 'boolean', name: 'is_correct' })
  isCorrect: boolean;

  @Column({ type: 'int', name: 'order_index' })
  orderIndex: number;

  @CreateDateColumn({ name: 'saved_at' })
  savedAt: Date;
}
