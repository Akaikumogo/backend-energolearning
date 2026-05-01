import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AudioBook } from './audio-book.entity';
import { AudioParagraph } from './audio-paragraph.entity';

@Entity({ name: 'audio_chapters' })
export class AudioChapter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'int', name: 'order_index', default: 0 })
  orderIndex: number;

  @ManyToOne(() => AudioBook, (b) => b.chapters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book_id' })
  book: AudioBook;

  @Column({ type: 'uuid', name: 'book_id' })
  bookId: string;

  @OneToMany(() => AudioParagraph, (p) => p.chapter)
  paragraphs: AudioParagraph[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

