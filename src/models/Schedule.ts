import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Course } from './Course';

@Entity()
export class Schedule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Course, (c: Course) => c.id, { eager: true })
  course!: Course;

  @Column({ type: 'timestamp' })
  startAt!: Date;

  @Column({ type: 'timestamp' })
  endAt!: Date;

  @Column({ nullable: true })
  recurrence?: string; // cron-like or iCal RRULE (optional)
}
