import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AudioChapter } from './audio-chapter.entity';

@Entity({ name: 'audio_paragraphs' })
export class AudioParagraph {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'int', name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ type: 'text', name: 'audio_url' })
  audioUrl: string;

  @ManyToOne(() => AudioChapter, (c) => c.paragraphs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chapter_id' })
  chapter: AudioChapter;

  @Column({ type: 'uuid', name: 'chapter_id' })
  chapterId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

