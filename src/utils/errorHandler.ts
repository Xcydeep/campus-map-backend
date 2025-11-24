import { Response } from 'express';

export function handleError(res: Response, error: any, message = 'Internal Server Error', statusCode = 500) {
  console.error(error);
  res.status(statusCode).json({
    message,
    error: error?.message || error?.toString() || error,
  });
}

export function notFound(res: Response, message = 'Not Found') {
  res.status(404).json({ message });
}

export function conflict(res: Response, message = 'Conflict') {
  res.status(409).json({ message });
}

export function badRequest(res: Response, message = 'Bad Request') {
  res.status(400).json({ message });
}
