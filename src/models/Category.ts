import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Place } from './Place';

@Entity()
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @OneToMany(() => Place, (place: Place) => place.category)
  places?: Place[];
}
