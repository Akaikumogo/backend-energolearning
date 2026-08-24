import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Singleton sozlama (source = default). Token superadmin sahifasidan. */
@Entity({ name: 'telegram_bot_settings' })
export class TelegramBotSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true, default: 'default' })
  source: string;

  @Column({ type: 'text', name: 'bot_token', nullable: true })
  botToken: string | null;

  @Column({
    type: 'text',
    name: 'web_app_url',
    nullable: true,
  })
  webAppUrl: string | null;

  @Column({ type: 'boolean', name: 'is_enabled', default: true })
  isEnabled: boolean;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
