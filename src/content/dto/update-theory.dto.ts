import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTheoryDto } from './create-theory.dto';

export class UpdateTheoryDto extends PartialType(
  OmitType(CreateTheoryDto, ['levelId'] as const),
) {}
