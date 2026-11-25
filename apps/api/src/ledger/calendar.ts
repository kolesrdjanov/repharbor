import { Temporal } from '@js-temporal/polyfill';

export function dateInZone(at: Date, zone: string) {
  return Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(zone).toPlainDate();
}

export function localMidnight(value: string, zone: string) {
  const days = Temporal.PlainDate.from(value);
  return new Date(days.toZonedDateTime(zone).epochMilliseconds);
}

export function sqlDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function dueDate(at: Date, zone: string, dueDay: number) {
  const nextMonth = dateInZone(at, zone).with({ day: 1 }).add({ months: 1 }).with({ day: dueDay });
  return sqlDate(nextMonth.toString());
}

export function eligibilityEnd(at: Date, zone: string, months: number) {
  const start = Temporal.Instant.fromEpochMilliseconds(at.getTime()).toZonedDateTimeISO(zone);
  return new Date(start.add({ months }).epochMilliseconds);
}
