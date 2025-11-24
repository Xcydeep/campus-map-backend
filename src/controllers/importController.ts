import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Place } from '../models/Place';
import { Category } from '../models/Category';
import fs from 'fs';
import { parse } from 'csv-parse';

export async function importPlacesCSV(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ message: 'file required' });
  if (!pgDataSource) return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
  const path = req.file.path;
  const pgCatRepo = pgDataSource.getRepository(Category);
  const pgPlaceRepo = pgDataSource.getRepository(Place);
  const sqliteCatRepo = sqliteDataSource.getRepository(Category);
  const sqlitePlaceRepo = sqliteDataSource.getRepository(Place);

  const records: any[] = [];
  fs.createReadStream(path)
    .pipe(parse({ columns: true, skip_empty_lines: true }))
    .on('data', (row) => records.push(row))
    .on('end', async () => {
      for (const r of records) {
        const name = r.name || r.nom || r.label;
        const lat = parseFloat(r.latitude || r.lat || r.y);
        const lon = parseFloat(r.longitude || r.lon || r.x);
        const categoryName = r.category || r.categorie || r.type;
        let pgCat;
        let sqliteCat;
        if (categoryName) {
          pgCat = await pgCatRepo.findOne({ where: { name: categoryName } as any });
          if (!pgCat) {
            pgCat = pgCatRepo.create({ name: categoryName });
            await pgCatRepo.save(pgCat);
          }
          sqliteCat = await sqliteCatRepo.findOne({ where: { name: categoryName } as any });
          if (!sqliteCat) {
            sqliteCat = sqliteCatRepo.create({ name: categoryName });
            await sqliteCatRepo.save(sqliteCat);
          }
        }
        const p = pgPlaceRepo.create({ name, latitude: lat, longitude: lon, category: pgCat, description: r.description || '' });
        await pgPlaceRepo.save(p);

        const sp = sqlitePlaceRepo.create({ name, latitude: lat, longitude: lon, category: sqliteCat, description: r.description || '' });
        await sqlitePlaceRepo.save(sp);
      }
      fs.unlinkSync(path);
      res.json({ imported: records.length });
    })
    .on('error', (err) => {
      res.status(500).json({ message: err.message });
    });
}

export async function importPlacesGeoJSON(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ message: 'file required' });
  if (!pgDataSource) return res.status(500).json({ message: 'PostgreSQL DataSource is not initialized' });
  try {
    const data = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
    const pgCatRepo = pgDataSource.getRepository(Category);
    const pgPlaceRepo = pgDataSource.getRepository(Place);
    const sqliteCatRepo = sqliteDataSource.getRepository(Category);
    const sqlitePlaceRepo = sqliteDataSource.getRepository(Place);

    if (!data.features || !Array.isArray(data.features)) return res.status(400).json({ message: 'invalid geojson' });
    let count = 0;
    for (const f of data.features) {
      const props = f.properties || {};
      const coords = f.geometry && f.geometry.coordinates;
      if (!coords) continue;
      const [lon, lat] = coords;
      const categoryName = props.category || props.type;
      let pgCat;
      let sqliteCat;
      if (categoryName) {
        pgCat = await pgCatRepo.findOne({ where: { name: categoryName } as any });
        if (!pgCat) {
          pgCat = pgCatRepo.create({ name: categoryName });
          await pgCatRepo.save(pgCat);
        }
        sqliteCat = await sqliteCatRepo.findOne({ where: { name: categoryName } as any });
        if (!sqliteCat) {
          sqliteCat = sqliteCatRepo.create({ name: categoryName });
          await sqliteCatRepo.save(sqliteCat);
        }
      }
      const p = pgPlaceRepo.create({ name: props.name || props.nom || 'Unknown', latitude: lat, longitude: lon, category: pgCat, description: props.description || '' });
      await pgPlaceRepo.save(p);

      const sp = sqlitePlaceRepo.create({ name: props.name || props.nom || 'Unknown', latitude: lat, longitude: lon, category: sqliteCat, description: props.description || '' });
      await sqlitePlaceRepo.save(sp);

      count++;
    }
    fs.unlinkSync(req.file.path);
    res.json({ imported: count });
  } catch (e) {
    res.status(500).json({ message: 'Failed to import geojson', error: e });
  }
}
