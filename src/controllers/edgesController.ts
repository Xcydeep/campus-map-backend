import { Request, Response } from 'express';
import fs from 'fs';
import { parse } from 'csv-parse';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Edge } from '../models/Edge';

export async function importEdgesCSV(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ message: 'file required' });
  if (!pgDataSource) return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
  const path = req.file.path;
  const pgRepo = pgDataSource.getRepository(Edge);
  const sqliteRepo = sqliteDataSource.getRepository(Edge);
  const records: Array<Record<string, any>> = [];
  fs.createReadStream(path)
    .pipe(parse({ columns: true, skip_empty_lines: true }))
    .on('data', (row: Record<string, any>) => records.push(row))
    .on('end', async () => {
      for (const r of records) {
        const fromId = (r.fromId || r.from || r.source) as string;
        const toId = (r.toId || r.to || r.target) as string;
        const cost = parseFloat((r.cost || '1') as string);
        let meta: any = undefined;
        if (r.meta) {
          try { meta = JSON.parse(r.meta as string); } catch (e) { meta = r.meta; }
        }
        const e = pgRepo.create({ fromId, toId, cost, meta } as any);
        await pgRepo.save(e);

        const se = sqliteRepo.create({ fromId, toId, cost, meta } as any);
        await sqliteRepo.save(se);
      }
      try { fs.unlinkSync(path); } catch (e) {}
      res.json({ imported: records.length });
    })
    .on('error', (err: any) => res.status(500).json({ message: err.message }));
}
