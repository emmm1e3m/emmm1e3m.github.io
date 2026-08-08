export interface RandomCursor {
  state: number
}

export interface RandomValue {
  value: number
  cursor: RandomCursor
}

/** 将持久化字符串种子稳定映射为 32 位无符号整数。 */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

export function createRandomCursor(seed: string): RandomCursor {
  return { state: hashSeed(seed) }
}

/** Mulberry32 的单步纯函数版本，调用方显式保存下一游标。 */
export function nextRandom(cursor: RandomCursor): RandomValue {
  const state = (cursor.state + 0x6d2b79f5) >>> 0
  let value = state
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  value = (value ^ (value >>> 14)) >>> 0

  return {
    value: value / 4_294_967_296,
    cursor: { state },
  }
}

export function randomInteger(
  cursor: RandomCursor,
  minimum: number,
  maximum: number,
): { value: number; cursor: RandomCursor } {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
    throw new RangeError('随机整数边界无效')
  }

  const next = nextRandom(cursor)
  return {
    value: minimum + Math.floor(next.value * (maximum - minimum + 1)),
    cursor: next.cursor,
  }
}
