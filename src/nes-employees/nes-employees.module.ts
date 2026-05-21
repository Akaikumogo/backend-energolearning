import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NesEmployeeHistory } from '../database/entities/nes-employee-history.entity';
import { NesEmployeePositionHistory } from '../database/entities/nes-employee-position-history.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { User } from '../database/entities/user.entity';
import { NesEmployeesController } from './nes-employees.controller';
import { NesEmployeesService } from './nes-employees.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NesEmployee,
      NesEmployeeHistory,
      NesEmployeePositionHistory,
      Organization,
      User,
      UserOrganization,
    ]),
  ],
  controllers: [NesEmployeesController],
  providers: [NesEmployeesService],
})
export class NesEmployeesModule {}
