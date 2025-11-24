import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;
  
  @Column({ nullable: true })
  name?: string; // new user name field

  @Column({ default: false })
  isAdmin!: boolean;
}
