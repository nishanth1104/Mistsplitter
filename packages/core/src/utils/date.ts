/**
 * Date utilities for consistent timestamp handling.
 * All timestamps are stored and compared in UTC.
 */

export function nowUtc(): Date {
  return new Date()
}

export function toISOString(date: Date): string {
  return date.toISOString()
}

export function parseDate(value: string): Date {
  const d = new Date(value)
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${value}`)
  }
  return d
}

export function daysBefore(days: number, from: Date = new Date()): Date {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

export function secondsBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 1000)
}
