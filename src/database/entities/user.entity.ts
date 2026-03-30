import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { UserOrganization } from './user-organization.entity';
import { RefreshToken } from './refresh-token.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text', nullable: true, name: 'password_hash' })
  passwordHash: string | null;

  @Column({ type: 'text', nullable: true, unique: true, name: 'google_id' })
  googleId: string | null;

  @Column({ type: 'text', name: 'first_name', default: '' })
  firstName: string;

  @Column({ type: 'text', name: 'last_name', default: '' })
  lastName: string;

  @Column({ type: 'text', name: 'avatar_url', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'text', default: Role.USER })
  role: Role;

  @OneToMany(() => UserOrganization, (uo) => uo.user)
  organizations: UserOrganization[];

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens: RefreshToken[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
