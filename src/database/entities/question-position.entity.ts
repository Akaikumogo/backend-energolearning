import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Question } from './question.entity';
import { Position } from './position.entity';

/**
 * O'quv savolini lavozimga bog'lash (exam_question_positions bilan bir xil
 * pattern). Hech qanday lavozimga bog'lanmagan savol BARCHA xodimlarga
 * tushadi; bog'langan savol faqat shu lavozimdagi xodimlarga tushadi.
 */
@Entity({ name: 'question_positions' })
@Unique('uq_question_position', ['questionId', 'positionId'])
export class QuestionPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Question, (q) => q.positionLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question: Question;

  @Column({ type: 'uuid', name: 'question_id' })
  questionId: string;

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position;

  @Column({ type: 'uuid', name: 'position_id' })
  positionId: string;
}
