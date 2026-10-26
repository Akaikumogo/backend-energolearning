import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProctorPolicy, ProctorResult } from '../database/entities/proctor.entities';
import { examRoomRequired } from './proctor.engine';

function asDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

@Injectable()
export class ProctorGate {
  constructor(
    @InjectRepository(ProctorPolicy)
    private readonly policies: Repository<ProctorPolicy>,
    @InjectRepository(ProctorResult)
    private readonly results: Repository<ProctorResult>,
  ) {}

  async assertApprovalAllowed(input: {
    recordTypeCode: string;
    examDate: string | null;
    safetyRecordId: string;
  }) {
    const policy = await this.policies.findOne({
      where: { recordTypeCode: input.recordTypeCode },
    });
    const required = examRoomRequired(
      policy
        ? {
            requiresExamRoom: policy.requiresExamRoom,
            cutoffDate: asDay(policy.cutoffDate) ?? '2026-12-01',
          }
        : null,
      asDay(input.examDate),
    );
    if (!required) return;
    const result = await this.results.findOne({
      where: { safetyRecordId: input.safetyRecordId },
    });
    if (!result) {
      throw new BadRequestException(
        'Bu sana uchun yakunlangan attestatsiya imtihoni yo‘q. Avval xona topshirilishi kerak.',
      );
    }
  }
}
