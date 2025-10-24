export function isSameUtcDate(dateA: Date, dateB: Date): boolean {
  if (Number.isNaN(dateA.getTime()) || Number.isNaN(dateB.getTime())) {
    return false;
  }

  return (
    dateA.getUTCFullYear() === dateB.getUTCFullYear() &&
    dateA.getUTCMonth() === dateB.getUTCMonth() &&
    dateA.getUTCDate() === dateB.getUTCDate()
  );
}

export function isUtcDateToday(date: Date, reference: Date = new Date()): boolean {
  return isSameUtcDate(date, reference);
}
