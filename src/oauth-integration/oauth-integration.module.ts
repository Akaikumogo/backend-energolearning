import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthIntegrationSetting } from '../database/entities/oauth-integration-setting.entity';
import { AuthModule } from '../auth/auth.module';
import { OAuthIntegrationSettingsService } from './oauth-integration-settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthIntegrationSetting]),
    forwardRef(() => AuthModule),
  ],
  providers: [OAuthIntegrationSettingsService],
  exports: [OAuthIntegrationSettingsService],
})
export class OAuthIntegrationModule {}
