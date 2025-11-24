import { Request, Response } from 'express';
import { pgDataSource, sqliteDataSource } from '../loaders/database';
import { Schedule } from '../models/Schedule';

export async function updateSchedule(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL database not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Schedule);
    const sqliteRepo = sqliteDataSource.getRepository(Schedule);
    const { id } = req.params;
    const { courseId, startAt, endAt, recurrence } = req.body;
    const schedule = await pgRepo.findOne({ where: { id } });
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    schedule.course = { id: courseId } as any;
    schedule.startAt = new Date(startAt);
    schedule.endAt = new Date(endAt);
    schedule.recurrence = recurrence;
    const updatedPg = await pgRepo.save(schedule);
    const sqliteSchedule = await sqliteRepo.findOne({ where: { id } });
    if (sqliteSchedule) {
      sqliteSchedule.course = { id: courseId } as any;
      sqliteSchedule.startAt = new Date(startAt);
      sqliteSchedule.endAt = new Date(endAt);
      sqliteSchedule.recurrence = recurrence;
      await sqliteRepo.save(sqliteSchedule);
    }
    res.json(updatedPg);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update schedule', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function listSchedules(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL database not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Schedule);
    const schedules = await pgRepo.find({ relations: ["course"] });
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ message: 'Failed to list schedules', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function createSchedule(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL database not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Schedule);
    const sqliteRepo = sqliteDataSource.getRepository(Schedule);
    const { courseId, startAt, endAt, recurrence } = req.body;
    const schedule = pgRepo.create({
      course: { id: courseId } as any,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      recurrence,
    });
    const savedPg = await pgRepo.save(schedule);
    const sqliteSchedule = sqliteRepo.create({
      course: { id: courseId } as any,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      recurrence,
    });
    await sqliteRepo.save(sqliteSchedule);
    res.status(201).json(savedPg);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create schedule', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function deleteSchedule(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL database not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Schedule);
    const sqliteRepo = sqliteDataSource.getRepository(Schedule);
    const { id } = req.params;
    const schedule = await pgRepo.findOne({ where: { id } });
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }
    await pgRepo.remove(schedule);
    const sqliteSchedule = await sqliteRepo.findOne({ where: { id } });
    if (sqliteSchedule) {
      await sqliteRepo.remove(sqliteSchedule);
    }
    res.json({ message: 'Schedule deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete schedule', error: err instanceof Error ? err.message : String(err) });
  }
}

export async function schedulesNow(req: Request, res: Response) {
  try {
    if (!pgDataSource) {
      return res.status(500).json({ message: 'PostgreSQL database not initialized' });
    }
    const pgRepo = pgDataSource.getRepository(Schedule);
    const now = new Date();
    const schedules = await pgRepo
      .createQueryBuilder('schedule')
      .where('schedule.startAt <= :now AND schedule.endAt >= :now', { now })
      .getMany();
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch current schedules', error: err instanceof Error ? err.message : String(err) });
  }
}
