import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'oauth_integration_settings' })
export class OAuthIntegrationSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true, default: 'energo-id' })
  source: string;

  @Column({
    type: 'text',
    name: 'mobile_redirect_uri',
    default: 'uz.elektroxavfsizlik.app://oauth/callback',
  })
  mobileRedirectUri: string;

  @Column({
    type: 'text',
    name: 'web_redirect_uri',
    default: 'http://localhost:5173/oauth/callback',
  })
  webRedirectUri: string;

  @Column({ type: 'text', name: 'callback_path', default: '/oauth/callback' })
  callbackPath: string;

  @Column({
    type: 'text',
    name: 'oauth_scopes',
    default: 'employee.auth profile.read',
  })
  oauthScopes: string;

  @Column({ type: 'uuid', name: 'updated_by', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
