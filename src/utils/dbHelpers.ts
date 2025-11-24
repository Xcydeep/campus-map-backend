import { DataSource, Repository, ObjectLiteral } from 'typeorm';
import { pgDataSource, sqliteDataSource } from '../loaders/database';

export function getPgRepo<Entity extends ObjectLiteral>(entity: { new (): Entity }): Repository<Entity> {
  if (!pgDataSource) {
    throw new Error('PostgreSQL DataSource is not initialized');
  }
  return pgDataSource.getRepository(entity);
}

export function getSqliteRepo<Entity extends ObjectLiteral>(entity: { new (): Entity }): Repository<Entity> {
  return sqliteDataSource.getRepository(entity);
}
