import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Organization } from './organization.entity';
import { Question } from './question.entity';
import { QuestionOption } from './question-option.entity';

@Entity({ name: 'user_question_attempts' })
export class UserQuestionAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ type: 'uuid', name: 'organization_id' })
  organizationId: string;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: Question;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @ManyToOne(() => QuestionOption, { nullable: true })
  @JoinColumn({ name: 'selected_option_id' })
  selectedOption: QuestionOption;

  @Column({ type: 'uuid', name: 'selected_option_id', nullable: true })
  selectedOptionId: string | null;

  @Column({ type: 'boolean', name: 'is_correct', default: false })
  isCorrect: boolean;

  @Column({ type: 'timestamptz', name: 'answered_at', default: () => 'NOW()' })
  answeredAt: Date;
}
