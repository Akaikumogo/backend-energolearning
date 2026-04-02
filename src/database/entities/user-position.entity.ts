import {
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  Column,
} from 'typeorm';
import { User } from './user.entity';
import { Position } from './position.entity';

@Entity({ name: 'user_positions' })
@Unique('uq_user_position', ['userId', 'positionId'])
export class UserPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => Position, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'position_id' })
  position: Position;

  @Column({ type: 'uuid', name: 'position_id' })
  positionId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

