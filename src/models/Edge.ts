import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Edge {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  fromId!: string;

  @Column()
  toId!: string;

  @Column('double precision', { default: 1 })
  cost!: number;

  @Column('simple-json', { nullable: true })
  meta?: any;
}
