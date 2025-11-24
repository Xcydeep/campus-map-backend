import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Session } from './Session';
import { Position } from './Position';

@Entity()
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  deviceId!: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastSeen?: Date;

  @OneToMany(() => Session, (s: Session) => s.device)
  sessions?: Session[];

  @OneToMany(() => Position, (p: Position) => p.device)
  positions?: Position[];
}
