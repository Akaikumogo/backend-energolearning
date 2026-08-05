import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'safety_record_types' })
export class SafetyRecordType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  code: string;

  @Column({ type: 'text', name: 'title_uz' })
  titleUz: string;

  @Column({ type: 'text', name: 'title_ru', default: '' })
  titleRu: string;

  @Column({ type: 'text', name: 'title_en', default: '' })
  titleEn: string;

  /** URL section slug, e.g. fire-safety */
  @Column({ type: 'text', name: 'section_slug' })
  sectionSlug: string;

  @Column({ type: 'int', name: 'sort_order', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
