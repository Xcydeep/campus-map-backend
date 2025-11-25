import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { PlaceLite } from './PlaceLite';

@Entity()
export class CategoryLite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  // Relation uniquement avec PlaceLite (pas avec Place)
  @OneToMany(() => PlaceLite, (place: PlaceLite) => place.category)
  places?: PlaceLite[];
}