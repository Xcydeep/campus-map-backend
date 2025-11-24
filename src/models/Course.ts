import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Instructor } from './Instructor';
import { Place } from './Place';

@Entity()
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  code!: string; // ex: INF101

  @Column()
  title!: string;

  @Column({ nullable: true })
  lecturer?: string;

  @ManyToOne(() => Instructor, (i: Instructor) => i.courses, { nullable: true, eager: true })
  instructor?: Instructor;

  @Column({ type: "timestamp" })
  startAt!: Date;

  @Column({ type: "timestamp" })
  endAt!: Date;

  // Maintenant lié à Place au lieu de Room
  @ManyToOne(() => Place, (p: Place) => p.courses, { nullable: true, eager: true })
  place?: Place;
}