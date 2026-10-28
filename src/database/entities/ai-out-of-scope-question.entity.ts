import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'ai_out_of_scope_questions' })
@Index('ix_ai_out_of_scope_created', ['createdAt'])
export class AiOutOfScopeQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'text', name: 'user_name' })
  userName: string;

  @Column({ type: 'text', name: 'user_role' })
  userRole: string;

  @Column({ type: 'text' })
  audience: 'superadmin' | 'central' | 'branch';

  @Column({ type: 'text', name: 'scope_label' })
  scopeLabel: string;

  @Column({ type: 'text' })
  question: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
