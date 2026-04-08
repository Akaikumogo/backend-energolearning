import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExamQuestionSection } from '../../common/enums/exam-question-section.enum';
import type { ExamQuestion } from './exam-question.entity';

@Entity({ name: 'exam_question_catalogs' })
export class ExamQuestionCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  section: ExamQuestionSection;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sortOrder: number;

  @OneToMany('ExamQuestion', 'catalog')
  questions: ExamQuestion[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
