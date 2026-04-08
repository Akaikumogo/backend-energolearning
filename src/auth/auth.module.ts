import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmployeeCertificate } from '../database/entities/employee-certificate.entity';
import { EmployeeCheck } from '../database/entities/employee-check.entity';

const jwtExpiresIn: StringValue = (process.env.JWT_EXPIRES_IN ??
  '12h') as StringValue;

@Module({
  imports: [
    UsersModule,
    OrganizationsModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken, EmployeeCertificate, EmployeeCheck]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'elektrolearn-dev-secret',
      signOptions: {
        expiresIn: jwtExpiresIn,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
