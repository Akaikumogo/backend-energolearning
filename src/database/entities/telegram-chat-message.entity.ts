import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TelegramReportChat } from './telegram-report-chat.entity';

export type TelegramMessageDirection = 'in' | 'out';
export type TelegramMessageKind =
  | 'text'
  | 'photo'
  | 'document'
  | 'video'
  | 'audio'
  | 'command'
  | 'report'
  | 'other';

@Entity({ name: 'telegram_chat_messages' })
export class TelegramChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', name: 'chat_row_id' })
  chatRowId: string;

  @ManyToOne(() => TelegramReportChat, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chat_row_id' })
  chat: TelegramReportChat;

  /** in = foydalanuvchi/guruh → bot; out = bot/superadmin → chat */
  @Column({ type: 'text' })
  direction: TelegramMessageDirection;

  @Column({ type: 'text', default: 'text' })
  kind: TelegramMessageKind;

  @Column({ type: 'bigint', name: 'telegram_message_id', nullable: true })
  telegramMessageId: string | null;

  @Column({ type: 'bigint', name: 'from_user_id', nullable: true })
  fromUserId: string | null;

  @Column({ type: 'text', name: 'from_username', nullable: true })
  fromUsername: string | null;

  @Column({ type: 'text', name: 'from_name', nullable: true })
  fromName: string | null;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'text', nullable: true })
  caption: string | null;

  @Column({ type: 'text', name: 'media_file_id', nullable: true })
  mediaFileId: string | null;

  /** Lokal saqlangan fayl: `/uploads/telegram/...` */
  @Column({ type: 'text', name: 'media_url', nullable: true })
  mediaUrl: string | null;

  @Column({ type: 'text', name: 'media_file_name', nullable: true })
  mediaFileName: string | null;

  @Column({ type: 'text', name: 'media_mime', nullable: true })
  mediaMime: string | null;

  @Column({ type: 'boolean', name: 'is_command', default: false })
  isCommand: boolean;

  @Column({ type: 'text', name: 'command_name', nullable: true })
  commandName: string | null;

  /** Superadmin javob yozganda */
  @Column({ type: 'uuid', name: 'sent_by_admin_id', nullable: true })
  sentByAdminId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
