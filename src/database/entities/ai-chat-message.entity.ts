import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiChatSession } from './ai-chat-session.entity';

@Entity({ name: 'ai_chat_messages' })
@Index('ix_ai_chat_messages_session_created', ['sessionId', 'createdAt'])
export class AiChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AiChatSession, (session) => session.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session: AiChatSession;

  @Column({ type: 'uuid', name: 'session_id' })
  sessionId: string;

  @Column({ type: 'text' })
  role: 'user' | 'assistant';

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
