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

  @Column({ type: 'uuid', nullable: true, unique: true, name: 'energo_id' })
  energoId: string | null;

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

  @Column({ type: 'text', name: 'initial_password', nullable: true })
  initialPassword: string | null;

  @Column({
    type: 'boolean',
    name: 'must_change_password',
    default: false,
  })
  mustChangePassword: boolean;

  /** Email-login / o‘z-o‘zidan register — kirish yopilgan. */
  @Column({
    type: 'boolean',
    name: 'login_blocked',
    default: false,
  })
  loginBlocked: boolean;

  /** Avatar yuklash payti yuz aniqlangan-aniqlanmaganligi (mobilning client-side
   *  face-detection natijasi). Kelajakda yuzni qayta tanish uchun yoki audit
   *  uchun ishlatiladi. */
  @Column({
    type: 'boolean',
    name: 'avatar_has_face',
    default: false,
  })
  avatarHasFace: boolean;

  @OneToMany(() => UserOrganization, (uo) => uo.user)
  organizations: UserOrganization[];

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens: RefreshToken[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
