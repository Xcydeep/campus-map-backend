import { Request, Response } from 'express';
// Node 18+ : fetch est global


const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

export async function getMapboxRoute(req: Request, res: Response) {
  if (!MAPBOX_TOKEN) return res.status(500).json({ message: 'MAPBOX_TOKEN not configured' });
  const { fromLon, fromLat, toLon, toLat } = req.query as any;
  if (!fromLon || !fromLat || !toLon || !toLat) return res.status(400).json({ message: 'fromLon,fromLat,toLon,toLat required' });
  const coords = `${fromLon},${fromLat};${toLon},${toLat}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  const r = await fetch(url);
  const json = await r.json();
  return res.json(json);
}
