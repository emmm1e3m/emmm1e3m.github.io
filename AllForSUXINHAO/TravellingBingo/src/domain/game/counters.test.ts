import { describe, expect, it } from 'vitest'

import { incrementSafeCounter, saturatingAddSafeCounter } from './counters'

describe('持久计数器饱和运算', () => {
  it('正常递增并在安全整数上限保持不变', () => {
    expect(incrementSafeCounter(0)).toBe(1)
    expect(incrementSafeCounter(Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER)
    expect(incrementSafeCounter(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(saturatingAddSafeCounter(Number.MAX_SAFE_INTEGER - 2, 10)).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('拒绝非法输入，避免用浮点溢出掩盖损坏状态', () => {
    for (const [value, increment] of [
      [-1, 1],
      [0.5, 1],
      [0, -1],
      [0, Number.MAX_SAFE_INTEGER + 1],
    ]) {
      expect(() => saturatingAddSafeCounter(value, increment)).toThrow(RangeError)
    }
  })
})
