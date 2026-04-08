import { PartialType } from '@nestjs/swagger';
import { CreateExamQuestionCatalogDto } from './create-exam-question-catalog.dto';

export class UpdateExamQuestionCatalogDto extends PartialType(CreateExamQuestionCatalogDto) {}
