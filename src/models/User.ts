import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Session } from './Session';

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

  @OneToMany(() => Session, (s) => s.user)
  sessions!: Session[];


  @Column({ default: false })
  isAdmin!: boolean;
}
