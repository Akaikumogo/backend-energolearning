import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TelegramChatMessage } from './telegram-chat-message.entity';

@Entity({ name: 'telegram_report_chats' })
export class TelegramReportChat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'bigint', name: 'chat_id' })
  chatId: string;

  @Column({ type: 'text', name: 'chat_type' })
  chatType: string;

  @Column({ type: 'text', name: 'chat_title', nullable: true })
  chatTitle: string | null;

  /** Shaxsiy chat uchun peer */
  @Column({ type: 'bigint', name: 'peer_user_id', nullable: true })
  peerUserId: string | null;

  @Column({ type: 'text', name: 'peer_username', nullable: true })
  peerUsername: string | null;

  @Column({ type: 'text', name: 'peer_first_name', nullable: true })
  peerFirstName: string | null;

  @Column({ type: 'text', name: 'peer_last_name', nullable: true })
  peerLastName: string | null;

  @Column({ type: 'bigint', name: 'started_by_user_id', nullable: true })
  startedByUserId: string | null;

  @Column({ type: 'text', name: 'started_by_username', nullable: true })
  startedByUsername: string | null;

  /** /start yoki /hisobot — kunlik hisobot oladi */
  @Column({ type: 'boolean', name: 'report_enabled', default: false })
  reportEnabled: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'int', name: 'unread_count', default: 0 })
  unreadCount: number;

  @Column({ type: 'timestamptz', name: 'last_message_at', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'text', name: 'last_message_preview', nullable: true })
  lastMessagePreview: string | null;

  @OneToMany(() => TelegramChatMessage, (m) => m.chat)
  messages: TelegramChatMessage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
