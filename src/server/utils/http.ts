import type { Response } from 'express'

type JsonRecord = Record<string, unknown>

export function sendSuccess(
  res: Response,
  payload: JsonRecord = {},
  status = 200,
): void {
  res.status(status).json({
    success: true,
    data: payload,
  })
}

export function sendError(
  res: Response,
  status: number,
  message: string,
  code = 'REQUEST_FAILED',
  details?: string,
): void {
  const body: JsonRecord = {
    success: false,
    error: message,
    code,
  }

  if (details) body.details = details

  res.status(status).json(body)
}
