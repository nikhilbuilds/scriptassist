import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

@Entity('tasks')
@Index('idx_tasks_user_id', ['userId'])
@Index('idx_tasks_status', ['status'])
@Index('idx_tasks_priority', ['priority'])
@Index('idx_tasks_due_date', ['dueDate'])
@Index('idx_tasks_user_status', ['userId', 'status'])
@Index('idx_tasks_user_priority', ['userId', 'priority'])
@Index('idx_tasks_user_created', ['userId', 'createdAt'])
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  @Column({ name: 'due_date', nullable: true, type: 'timestamp' })
  dueDate: Date;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne('User', 'tasks')
  @JoinColumn({ name: 'user_id' })
  user?: any;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
