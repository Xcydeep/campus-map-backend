import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Place } from './Place';

@Entity()
export class Signalement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Place, (p: Place) => p.id, { nullable: true, eager: true })
  place?: Place;

  @Column({ nullable: true })
  message?: string;

  @Column('simple-json', { nullable: true })
  photos?: string[];

  @Column({ default: 'pending' })
  status!: 'pending' | 'accepted' | 'rejected';

  @CreateDateColumn()
  createdAt!: Date;
}
