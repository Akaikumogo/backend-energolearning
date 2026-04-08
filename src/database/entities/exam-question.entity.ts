import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionType } from '../../common/enums/question-type.enum';
import { ExamQuestionSection } from '../../common/enums/exam-question-section.enum';
import { ExamQuestionDifficulty } from '../../common/enums/exam-question-difficulty.enum';
import { ExamQuestionOption } from './exam-question-option.entity';
import { ExamQuestionPosition } from './exam-question-position.entity';
import { ExamQuestionCatalog } from './exam-question-catalog.entity';

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

  @Column({ type: 'text', name: 'section', default: ExamQuestionSection.PT })
  section: ExamQuestionSection;

  @Column({ type: 'text', name: 'difficulty', default: ExamQuestionDifficulty.MEDIUM })
  difficulty: ExamQuestionDifficulty;

  @ManyToOne(() => ExamQuestionCatalog, (c) => c.questions, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'catalog_id' })
  catalog: ExamQuestionCatalog | null;

  @Column({ type: 'uuid', name: 'catalog_id', nullable: true })
  catalogId: string | null;

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

