import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'admin_audit_logs' })
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'text', name: 'actor_role', nullable: true })
  actorRole: string | null;

  @Column({ type: 'jsonb', name: 'actor_organization_ids', nullable: true })
  actorOrganizationIds: string[] | null;

  @Column({ type: 'text' })
  method: string;

  @Column({ type: 'text' })
  path: string;

  @Column({ type: 'int', name: 'status_code' })
  statusCode: number;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'text', name: 'request_body_preview', nullable: true })
  requestBodyPreview: string | null;

  @Column({ type: 'text', nullable: true })
  ip: string | null;

  @Column({ type: 'text', name: 'user_agent', nullable: true })
  userAgent: string | null;

  @Column({ type: 'int', name: 'duration_ms', nullable: true })
  durationMs: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

