import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ type: 'bigint', name: 'started_by_user_id', nullable: true })
  startedByUserId: string | null;

  @Column({ type: 'text', name: 'started_by_username', nullable: true })
  startedByUsername: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
