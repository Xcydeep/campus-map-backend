import { Request, Response } from 'express';
import { badRequest, handleError } from '../utils/errorHandler';

// Helper function to calculate haversine distance between two coordinates
function haversineDistance(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371e3; // meters
  const phi1 = toRad(a[0]);
  const phi2 = toRad(b[0]);
  const dPhi = toRad(b[0] - a[0]);
  const dLambda = toRad(b[1] - a[1]);
  const x = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

// Simple route: straight-line waypoints between origin and destination
export async function getRoute(req: Request, res: Response) {
  try {
    const { fromLat, fromLon, toLat, toLon } = req.query;
    if (!fromLat || !fromLon || !toLat || !toLon) {
      return badRequest(res, 'fromLat, fromLon, toLat, and toLon are required');
    }
    const origin: [number, number] = [parseFloat(fromLat as string), parseFloat(fromLon as string)];
    const dest: [number, number] = [parseFloat(toLat as string), parseFloat(toLon as string)];

    const distance = haversineDistance(origin, dest);

    res.json({ distanceMeters: distance, geometry: [origin, dest] });
  } catch (err) {
    handleError(res, err, 'Failed to calculate route');
  }
}
