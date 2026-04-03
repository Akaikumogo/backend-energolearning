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
import { ExamType } from '../../common/enums/exam-type.enum';
import { Organization } from './organization.entity';
import { ExamAssignment } from './exam-assignment.entity';

@Entity({ name: 'exams' })
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', name: 'exam_type' })
  examType: ExamType;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', name: 'includes_pt', default: true })
  includesPt: boolean;

  @Column({ type: 'boolean', name: 'includes_tb', default: true })
  includesTb: boolean;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_org_id' })
  createdByOrg: Organization | null;

  @Column({ type: 'uuid', name: 'created_by_org_id', nullable: true })
  createdByOrgId: string | null;

  @OneToMany(() => ExamAssignment, (a) => a.exam)
  assignments: ExamAssignment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}

