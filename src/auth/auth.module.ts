import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EnergoIdAuthClient } from './energo-id-auth.client';
import { OAuthPendingService } from './oauth-pending.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LoginThrottleGuard } from './guards/login-throttle.guard';
import { EmployeeCertificate } from '../database/entities/employee-certificate.entity';
import { EmployeeCheck } from '../database/entities/employee-check.entity';
import { UserActivityModule } from '../user-activity/user-activity.module';
import { OAuthIntegrationModule } from '../oauth-integration/oauth-integration.module';

const jwtExpiresIn: StringValue = (process.env.JWT_EXPIRES_IN ??
  '12h') as StringValue;

@Module({
  imports: [
    UsersModule,
    OrganizationsModule,
    forwardRef(() => UserActivityModule),
    forwardRef(() => OAuthIntegrationModule),
    PassportModule,
    TypeOrmModule.forFeature([
      RefreshToken,
      EmployeeCertificate,
      EmployeeCheck,
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'elektrolearn-dev-secret',
      signOptions: {
        expiresIn: jwtExpiresIn,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EnergoIdAuthClient, OAuthPendingService, JwtStrategy, LoginThrottleGuard],
  exports: [AuthService, EnergoIdAuthClient, JwtModule],
})
export class AuthModule {}
