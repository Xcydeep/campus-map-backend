import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Device } from './Device';
import { User } from './User';

@Entity()
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Device, (d: Device) => d.sessions, { eager: true })
  device!: Device;

  @ManyToOne(() => User, (u: User) => u.sessions, { eager: true })
  user!: User;

  @Column({ type: 'timestamp' })
  startedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt?: Date;

  @Column({ nullable: true })
  metadata?: string;
}
