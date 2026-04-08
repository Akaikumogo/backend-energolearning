import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Level } from './level.entity';
import { User } from './user.entity';
import { Question } from './question.entity';
import type { TheorySlide } from '../../common/types/theory-slide';

@Entity({ name: 'theories' })
export class Theory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Level, (l) => l.theories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'level_id' })
  level: Level;

  @Column({ type: 'uuid', name: 'level_id' })
  levelId: string;

  @Column({ type: 'text' })
  title: string;

  @ManyToOne(() => Theory, (t) => t.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_theory_id' })
  parent: Theory | null;

  @Column({ type: 'uuid', name: 'parent_theory_id', nullable: true })
  parentTheoryId: string | null;

  @OneToMany(() => Theory, (t) => t.parent)
  children: Theory[];

  @Column({ type: 'int', name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'jsonb', nullable: true, name: 'slides' })
  slides: TheorySlide[] | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById: string | null;

  @OneToMany(() => Question, (q) => q.theory)
  questions: Question[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
