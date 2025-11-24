import { Request, Response } from 'express';
import { getPgRepo, getSqliteRepo } from '../utils/dbHelpers';
import { Device } from '../models/Device';
import { Session } from '../models/Session';
import { AuthRequest } from '../middleware/jwtAuth';
import { Position } from '../models/Position';

// Simple in-memory SSE clients map: deviceId -> Set of Response objects
const sseClients: Map<string, Set<Response>> = new Map();

export async function registerDevice(req: Request, res: Response) {
  const { deviceId, name } = req.body;
  if (!deviceId) return res.status(400).json({ message: 'deviceId required' });
  try {
    const pgRepo = getPgRepo(Device);
    const sqliteRepo = getSqliteRepo(Device);

    let d = await pgRepo.findOne({ where: { deviceId } as any });
    if (!d) {
      d = pgRepo.create({ deviceId, name, lastSeen: new Date() });
      await pgRepo.save(d);

      const sd = sqliteRepo.create({ deviceId, name, lastSeen: new Date() });
      await sqliteRepo.save(sd);
    } else {
      d.lastSeen = new Date();
      if (name) d.name = name;
      await pgRepo.save(d);

      const sd = await sqliteRepo.findOne({ where: { deviceId } as any });
      if (sd) {
        sd.lastSeen = new Date();
        if (name) sd.name = name;
        await sqliteRepo.save(sd);
      }
    }
    res.json(d);
  } catch (err) {
    res.status(500).json({ message: 'Failed to register device', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function startSession(req: Request, res: Response) {
  const { deviceId, metadata } = req.body;
  if (!deviceId) return res.status(400).json({ message: 'deviceId required' });
  try {
    const pgDevRepo = getPgRepo(Device);
    const sqliteDevRepo = getSqliteRepo(Device);
    const pgSessRepo = getPgRepo(Session);
    const sqliteSessRepo = getSqliteRepo(Session);

    const device = await pgDevRepo.findOne({ where: { deviceId } as any });
    if (!device) return res.status(404).json({ message: 'device not found' });

    const s = pgSessRepo.create({ device, startedAt: new Date(), metadata });
    const savedSession = await pgSessRepo.save(s);

    const sqliteDevice = await sqliteDevRepo.findOne({ where: { deviceId } as any });
    if (sqliteDevice) {
      const ss = sqliteSessRepo.create({ device: sqliteDevice, startedAt: new Date(), metadata });
      await sqliteSessRepo.save(ss);
    }
    res.status(201).json(savedSession);
  } catch (err) {
    res.status(500).json({ message: 'Failed to start session', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function endSession(req: Request, res: Response) {
  const { sessionId } = req.params;
  try {
    const pgSessRepo = getPgRepo(Session);
    const sqliteSessRepo = getSqliteRepo(Session);

    const s = await pgSessRepo.findOne({ where: { id: sessionId } as any });
    if (!s) return res.status(404).json({ message: 'session not found' });

    s.endedAt = new Date();
    await pgSessRepo.save(s);

    const ss = await sqliteSessRepo.findOne({ where: { id: sessionId } as any });
    if (ss) {
      ss.endedAt = new Date();
      await sqliteSessRepo.save(ss);
    }
    res.json(s);
  } catch (err) {
    res.status(500).json({ message: 'Failed to end session', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function postLocation(req: AuthRequest, res: Response) {
  const body: any = (req as any).body;
  const { deviceId, latitude, longitude, accuracy, heading } = body;
  if (!deviceId || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ message: 'deviceId, latitude and longitude required' });
  }
  try {
    const pgDevRepo = getPgRepo(Device);
    const device = await pgDevRepo.findOne({ where: { deviceId } as any });
    if (!device) {
      return res.status(404).json({ message: 'device not found' });
    }
    device.lastSeen = new Date();
    await pgDevRepo.save(device);

    const sqliteDevRepo = getSqliteRepo(Device);
    const sqliteDevice = await sqliteDevRepo.findOne({ where: { deviceId } as any });
    if (sqliteDevice) {
      sqliteDevice.lastSeen = new Date();
      await sqliteDevRepo.save(sqliteDevice);
    }

    // persist position
    try {
      const pgPosRepo = getPgRepo(Position);
      const p = pgPosRepo.create({ device, latitude, longitude, accuracy, heading });
      await pgPosRepo.save(p);

      const sqlitePosRepo = getSqliteRepo(Position);
      if (sqliteDevice) {
        const sp = sqlitePosRepo.create({ device: sqliteDevice, latitude, longitude, accuracy, heading });
        await sqlitePosRepo.save(sp);
      }
    } catch (e) {
      // log but continue
      console.error('failed to persist position', e);
    }

    const payload = { deviceId, latitude, longitude, accuracy, heading, ts: new Date().toISOString() };

    const clients = sseClients.get(deviceId);
    if (clients) {
      for (const resObj of clients) {
        try {
          // proper SSE event
          resObj.write(`event: location\n`);
          resObj.write(`data: ${JSON.stringify(payload)}\n\n`);
        } catch (e) {
          // ignore individual client errors
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to post location', error: err instanceof Error ? err.message : String(err) });
  }
}

export function streamLocations(req: Request, res: Response) {
  const deviceId = (req.params as any).deviceId;
  if (!deviceId) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  if (!sseClients.has(deviceId)) sseClients.set(deviceId, new Set());
  sseClients.get(deviceId)!.add(res);

  const keepAlive = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch (e) { /* ignore */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const setClients = sseClients.get(deviceId);
    setClients && setClients.delete(res);
    try { res.end(); } catch (e) {}
  });
}
