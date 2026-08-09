/** ECMAScript Date 的 TimeClip 正向边界；超过它时 toISOString 会抛出 RangeError。 */
export const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000

export function isValidTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE_TIMESTAMP_MS
}

export function assertValidTimestamp(value: number, message: string): void {
  if (!isValidTimestamp(value)) throw new RangeError(message)
}
