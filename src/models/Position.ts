import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Device } from './Device';

@Entity()
export class Position {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Device, (d: Device) => d.positions, { eager: true })
  device!: Device;

  @Column('double precision')
  latitude!: number;

  @Column('double precision')
  longitude!: number;

  @Column({ type: 'double precision', nullable: true })
  accuracy?: number;

  @Column({ type: 'double precision', nullable: true })
  heading?: number;

  @CreateDateColumn()
  createdAt!: Date;
}
