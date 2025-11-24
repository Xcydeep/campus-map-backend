import { MigrationInterface, QueryRunner } from 'typeorm';
import fs from 'fs';
import path from 'path';

export class _0001Init1670000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlPath = path.join(__dirname, '..', '..', 'migrations', '0001_init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    // Split by semicolon and execute statements to avoid driver limitations
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await queryRunner.query(stmt);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A simple down that drops known tables. This is intentionally conservative.
    const drop = `
      DROP TABLE IF EXISTS position;
      DROP TABLE IF EXISTS session;
      DROP TABLE IF EXISTS device;
      DROP TABLE IF EXISTS schedule;
      DROP TABLE IF EXISTS course;
      DROP TABLE IF EXISTS instructor;
      DROP TABLE IF EXISTS edge;
      DROP TABLE IF EXISTS place;
      DROP TABLE IF EXISTS room;
      DROP TABLE IF EXISTS category;
      DROP TABLE IF EXISTS "user";
      DROP TABLE IF EXISTS signalement;
    `;
    const statements = drop.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await queryRunner.query(stmt);
    }
  }
}
