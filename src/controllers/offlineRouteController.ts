import { Request, Response } from 'express';
import { pgDataSource } from '../loaders/database';
import { Edge } from '../models/Edge';

type Adj = Record<string, Array<{ to: string; cost: number; edgeId: string }>>;

function dijkstra(adj: Adj, start: string, goal: string) {
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const pq: Set<string> = new Set();
  for (const k of Object.keys(adj)) { dist[k] = Infinity; prev[k] = null; pq.add(k); }
  if (!(start in dist) || !(goal in dist)) return null;
  dist[start] = 0;
  while (pq.size) {
    // extract min
    let u: string | null = null;
    let best = Infinity;
    for (const v of pq) {
      if (dist[v] < best) { best = dist[v]; u = v; }
    }
    if (u === null) break;
    pq.delete(u);
    if (u === goal) break;
    const neighbors = adj[u] || [];
    for (const e of neighbors) {
      const alt = dist[u] + e.cost;
      if (alt < dist[e.to]) {
        dist[e.to] = alt;
        prev[e.to] = u;
      }
    }
  }
  if (dist[goal] === Infinity) return null;
  const path: string[] = [];
  let cur: string | null = goal;
  while (cur) { path.unshift(cur); cur = prev[cur]; }
  return { path, distance: dist[goal] };
}

export async function offlineRoute(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL database not initialized' });
    }
    const fromId = req.query.fromId as string;
    const toId = req.query.toId as string;
    if (!fromId || !toId) return res.status(400).json({ message: 'fromId and toId required' });

    const repo = pgDataSource.getRepository(Edge);
    const edges = await repo.find();
    const adj: Adj = {};
    for (const e of edges) {
      if (!adj[e.fromId]) adj[e.fromId] = [];
      adj[e.fromId].push({ to: e.toId, cost: e.cost || 1, edgeId: e.id });
      // also add reverse by default
      if (!adj[e.toId]) adj[e.toId] = [];
      adj[e.toId].push({ to: e.fromId, cost: e.cost || 1, edgeId: e.id });
    }
    const result = dijkstra(adj, fromId, toId);
    if (!result) return res.status(404).json({ message: 'no path found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Failed to compute offline route', error: err instanceof Error ? err.message : String(err) });
  }
}
