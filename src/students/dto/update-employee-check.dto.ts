import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeCheckDto } from './create-employee-check.dto';

export class UpdateEmployeeCheckDto extends PartialType(CreateEmployeeCheckDto) {}

