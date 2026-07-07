import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Level } from './level.entity';
import { Position } from './position.entity';

@Entity({ name: 'level_positions' })
@Unique('uq_level_position', ['levelId', 'positionId'])
export class LevelPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Level, (level) => level.positionLinks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'level_id' })
  level: Level;

  @Column({ type: 'uuid', name: 'level_id' })
  levelId: string;

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position;

  @Column({ type: 'uuid', name: 'position_id' })
  positionId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
