import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export type CrudPermissions = {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type ModeratorPermissions = {
  // Content
  contentLevels: CrudPermissions;
  contentTheories: CrudPermissions;
  contentQuestions: CrudPermissions;
  // Org & people
  organizations: CrudPermissions;
  students: CrudPermissions;
  users: CrudPermissions;
  moderators: CrudPermissions;
  profile: CrudPermissions;
  /** Imtihonlar moduli: lavozimlar, imtihonlar, imtihon savollari, jadval, korzinka */
  exams: CrudPermissions;
  /** Audio kutubxona: audiokitoblar, boblar, paragraf(audioUrl) */
  audioLibrary: CrudPermissions;
  // New (page-level)
  analytics: CrudPermissions;
  permissions: CrudPermissions;
  violations: CrudPermissions;
  logs: CrudPermissions;
  nesSync: CrudPermissions;
  aiAssistant: CrudPermissions;
  /** Xavfsizlik / sertifikat ma'lumotlari (manual entry) */
  safetyRecords: CrudPermissions;
};

const DEFAULT_CRUD: CrudPermissions = {
  view: false,
  create: false,
  update: false,
  delete: false,
};

export const DEFAULT_MODERATOR_PERMISSIONS: ModeratorPermissions = {
  contentLevels: DEFAULT_CRUD,
  contentTheories: DEFAULT_CRUD,
  contentQuestions: DEFAULT_CRUD,
  organizations: DEFAULT_CRUD,
  students: DEFAULT_CRUD,
  users: DEFAULT_CRUD,
  moderators: DEFAULT_CRUD,
  profile: DEFAULT_CRUD,
  exams: DEFAULT_CRUD,
  audioLibrary: DEFAULT_CRUD,
  analytics: DEFAULT_CRUD,
  permissions: DEFAULT_CRUD,
  violations: DEFAULT_CRUD,
  logs: DEFAULT_CRUD,
  nesSync: DEFAULT_CRUD,
  aiAssistant: DEFAULT_CRUD,
  safetyRecords: DEFAULT_CRUD,
};

export const MODERATOR_PERMISSION_KEYS: (keyof ModeratorPermissions)[] = [
  'contentLevels',
  'contentTheories',
  'contentQuestions',
  'organizations',
  'students',
  'users',
  'moderators',
  'profile',
  'exams',
  'audioLibrary',
  'analytics',
  'permissions',
  'violations',
  'logs',
  'nesSync',
  'aiAssistant',
  'safetyRecords',
];

/** Eski jsonb qatorlarida yangi modullar bo‘lmasa, default bilan to‘ldiradi. */
export function mergeModeratorPermissions(
  partial?: Partial<ModeratorPermissions> | null,
): ModeratorPermissions {
  const out = {} as ModeratorPermissions;
  for (const key of MODERATOR_PERMISSION_KEYS) {
    const def = DEFAULT_MODERATOR_PERMISSIONS[key];
    const p = partial?.[key];
    out[key] = {
      view: p?.view ?? def.view,
      create: p?.create ?? def.create,
      update: p?.update ?? def.update,
      delete: p?.delete ?? def.delete,
    };
  }
  return out;
}

@Entity({ name: 'moderator_permissions' })
export class ModeratorPermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'moderator_user_id' })
  moderatorUser: User;

  @Column({ type: 'uuid', name: 'moderator_user_id', unique: true })
  moderatorUserId: string;

  @Column({ type: 'jsonb', name: 'permissions' })
  permissions: ModeratorPermissions;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
