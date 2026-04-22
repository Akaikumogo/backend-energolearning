import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { AiChatMessage } from './ai-chat-message.entity';

@Entity({ name: 'ai_chat_sessions' })
@Index('ix_ai_chat_sessions_user_scope', ['userId', 'scope'], { unique: true })
export class AiChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'text', default: 'mobile' })
  scope: 'mobile' | 'admin';

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @OneToMany(() => AiChatMessage, (message) => message.session)
  messages: AiChatMessage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
