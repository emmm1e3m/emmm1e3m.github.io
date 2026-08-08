import { describe, expect, it } from 'vitest'

import { createRandomCursor, nextRandom, randomInteger } from './prng'

describe('持久随机数', () => {
  it('同一字符串种子生成同一序列', () => {
    let left = createRandomCursor('旅行饼狗')
    let right = createRandomCursor('旅行饼狗')

    for (let index = 0; index < 10; index += 1) {
      const leftValue = nextRandom(left)
      const rightValue = nextRandom(right)
      expect(leftValue.value).toBe(rightValue.value)
      left = leftValue.cursor
      right = rightValue.cursor
    }
  })

  it('生成的整数包含指定闭区间且不会越界', () => {
    let cursor = createRandomCursor('integer-range')
    const values = new Set<number>()

    for (let index = 0; index < 100; index += 1) {
      const result = randomInteger(cursor, 2, 4)
      values.add(result.value)
      expect(result.value).toBeGreaterThanOrEqual(2)
      expect(result.value).toBeLessThanOrEqual(4)
      cursor = result.cursor
    }

    expect(values).toEqual(new Set([2, 3, 4]))
  })
})
