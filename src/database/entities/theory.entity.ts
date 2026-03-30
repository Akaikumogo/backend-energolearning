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

  @Column({ type: 'int', name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ type: 'text', default: '' })
  content: string;

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
