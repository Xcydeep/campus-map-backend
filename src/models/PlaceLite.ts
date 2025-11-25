import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { CategoryLite } from './CategoryLite';

@Entity()
export class PlaceLite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @ManyToOne(() => CategoryLite, (c) => c.places, { eager: true, nullable: true })
  category?: CategoryLite;

  @Column('double precision')
  latitude!: number;

  @Column('double precision')
  longitude!: number;
}