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
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type ModeratorPermissions = {
  contentLevels: CrudPermissions;
  contentTheories: CrudPermissions;
  contentQuestions: CrudPermissions;
  organizations: CrudPermissions;
  students: CrudPermissions;
  users: CrudPermissions;
  moderators: CrudPermissions;
  profile: CrudPermissions;
};

const DEFAULT_CRUD: CrudPermissions = { create: false, update: false, delete: false };

export const DEFAULT_MODERATOR_PERMISSIONS: ModeratorPermissions = {
  contentLevels: DEFAULT_CRUD,
  contentTheories: DEFAULT_CRUD,
  contentQuestions: DEFAULT_CRUD,
  organizations: DEFAULT_CRUD,
  students: DEFAULT_CRUD,
  users: DEFAULT_CRUD,
  moderators: DEFAULT_CRUD,
  profile: DEFAULT_CRUD,
};

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

