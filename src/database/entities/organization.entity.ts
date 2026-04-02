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
import { UserOrganization } from './user-organization.entity';

@Entity({ name: 'organizations' })
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  name: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_organization_id' })
  parentOrganization: Organization | null;

  @Column({ type: 'uuid', name: 'parent_organization_id', nullable: true })
  parentOrganizationId: string | null;

  @Column({ type: 'boolean', name: 'is_default', default: false })
  isDefault: boolean;

  @OneToMany(() => UserOrganization, (uo) => uo.organization)
  users: UserOrganization[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
