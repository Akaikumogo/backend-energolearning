import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionType } from '../../common/enums/question-type.enum';
import { ExamQuestionOption } from './exam-question-option.entity';
import { ExamQuestionPosition } from './exam-question-position.entity';

@Entity({ name: 'exam_questions' })
export class ExamQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'text' })
  type: QuestionType;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', array: true, nullable: true })
  tags: string[] | null;

  @OneToMany(() => ExamQuestionOption, (o) => o.question, { cascade: true })
  options: ExamQuestionOption[];

  @OneToMany(() => ExamQuestionPosition, (p) => p.question)
  positionLinks: ExamQuestionPosition[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}

