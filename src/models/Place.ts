import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Category } from './Category';
import { Course } from './Course';
import { Instructor } from './Instructor';

@Entity()
export class Place {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column('simple-json', { nullable: true })
  photos?: string[];

  @Column('double precision')
  latitude!: number;

  @Column('double precision')
  longitude!: number;

  @ManyToOne(() => Category, (c) => c.places, { eager: true, nullable: true })
  category?: Category;

  @Column({ nullable: true })
  officeOwner?: string;

  @Column('int', { nullable: true })
  capacity?: number;

  @Column({ nullable: true })
  building?: string;

  @Column({ nullable: true })
  floor?: string;

  @Column({ nullable: true })
  code?: string;

  @ManyToOne(() => Instructor, (instructor) => instructor.offices, { nullable: true, eager: true })
  instructor?: Instructor;

  @OneToMany(() => Course, (course) => course.place)
  courses?: Course[];
}