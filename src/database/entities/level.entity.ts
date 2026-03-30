import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Theory } from './theory.entity';
import { Question } from './question.entity';

@Entity({ name: 'levels' })
export class Level {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'int', name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdById: string | null;

  @OneToMany(() => Theory, (t) => t.level)
  theories: Theory[];

  @OneToMany(() => Question, (q) => q.level)
  questions: Question[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
