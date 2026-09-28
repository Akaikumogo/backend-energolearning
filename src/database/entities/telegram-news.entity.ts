import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TelegramNewsImage = { url: string; fileName: string };

/** Superadmin yaratgan news: rasmlar (≤ 10) + matn. */
@Entity({ name: 'telegram_news_posts' })
export class TelegramNewsPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', default: '' })
  body: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  images: TelegramNewsImage[];

  @Column({ type: 'boolean', name: 'with_app_button', default: true })
  withAppButton: boolean;

  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  createdById: string | null;

  @Column({ type: 'uuid', name: 'updated_by_id', nullable: true })
  updatedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

export type TelegramNewsMode = 'TEST' | 'ALL';
export type TelegramNewsStatus = 'RUNNING' | 'DONE' | 'FAILED';
export type TelegramNewsDeliveryStatus = 'SENT' | 'FAILED' | 'BLOCKED';

/** Yangilikni test / hammaga yuborish urinishlari. */
@Entity({ name: 'telegram_news_broadcasts' })
export class TelegramNewsBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'news_key' })
  newsKey: string;

  @Column({ type: 'varchar', length: 8 })
  mode: TelegramNewsMode;

  @Column({ type: 'varchar', length: 12, default: 'RUNNING' })
  status: TelegramNewsStatus;

  @Column({ type: 'uuid', name: 'test_chat_row_id', nullable: true })
  testChatRowId: string | null;

  @Column({ type: 'int', default: 0 })
  total: number;

  @Column({ type: 'int', default: 0 })
  sent: number;

  @Column({ type: 'int', default: 0 })
  failed: number;

  @Column({ type: 'int', default: 0 })
  blocked: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'uuid', name: 'started_by_id', nullable: true })
  startedById: string | null;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt: Date | null;
}

/** Bitta chatga bitta yangilik faqat bir marta (news_key + chat_row_id unique). */
@Entity({ name: 'telegram_news_deliveries' })
export class TelegramNewsDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'news_key' })
  newsKey: string;

  @Column({ type: 'uuid', name: 'chat_row_id' })
  chatRowId: string;

  @Column({ type: 'uuid', name: 'broadcast_id', nullable: true })
  broadcastId: string | null;

  @Column({ type: 'varchar', length: 8 })
  status: TelegramNewsDeliveryStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
