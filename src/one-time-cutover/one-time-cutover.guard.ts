import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OneTimeCutoverService } from './one-time-cutover.service';

/** Endpoint mavjud emasdek ko‘rinadi — Swagger va skanerlar uchun yopiq. */
@Injectable()
export class OneTimeCutoverGuard implements CanActivate {
  constructor(private readonly cutoverService: OneTimeCutoverService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (!this.cutoverService.isAvailable()) {
      throw new NotFoundException();
    }
    return true;
  }
}
