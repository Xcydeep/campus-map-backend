import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Course } from './Course';
import { Place } from './Place';

@Entity()
export class Instructor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  department?: string;

  @OneToMany(() => Course, (c: Course) => c.instructor)
  courses?: Course[];

  @OneToMany(() => Place, (place) => place.instructor)
  offices?: Place[];
}