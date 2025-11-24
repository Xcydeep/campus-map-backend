import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Device } from './Device';

@Entity()
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Device, (d: Device) => d.sessions, { eager: true })
  device!: Device;

  @Column({ type: 'timestamp' })
  startedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt?: Date;

  @Column({ nullable: true })
  metadata?: string;
}
