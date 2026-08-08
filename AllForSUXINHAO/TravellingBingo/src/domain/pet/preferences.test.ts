import { describe, expect, it } from 'vitest'

import {
  exhaustActivityPreference,
  generateActivityPreferences,
  getRefusalCountForRoll,
  isPetTired,
} from './preferences'

describe('饼狗活动偏好', () => {
  it('按 35% / 50% / 15% 的精确边界决定拒绝数量', () => {
    expect(getRefusalCountForRoll(0)).toBe(0)
    expect(getRefusalCountForRoll(0.349_999)).toBe(0)
    expect(getRefusalCountForRoll(0.35)).toBe(1)
    expect(getRefusalCountForRoll(0.849_999)).toBe(1)
    expect(getRefusalCountForRoll(0.85)).toBe(2)
    expect(getRefusalCountForRoll(0.999_999)).toBe(2)
    expect(() => getRefusalCountForRoll(1)).toThrow(RangeError)
    expect(() => getRefusalCountForRoll(-0.01)).toThrow(RangeError)
  })

  it('同一持久种子和偏好序号得到相同结果，且始终至少愿意一项', () => {
    for (let sequence = 0; sequence < 50; sequence += 1) {
      const first = generateActivityPreferences('preference-seed', sequence)
      const second = generateActivityPreferences('preference-seed', sequence)
      expect(first).toEqual(second)
      expect(Object.values(first.preferences).filter(Boolean).length).toBeGreaterThanOrEqual(1)
      expect(first.nextSequence).toBe(sequence + 1)
    }
  })

  it('活动后只消耗对应偏好，三项都耗尽时进入疲惫状态', () => {
    const initial = { travel: true, stream: true, trend: true }
    const afterTravel = exhaustActivityPreference(initial, 'travel')
    const afterStream = exhaustActivityPreference(afterTravel, 'stream')
    const afterTrend = exhaustActivityPreference(afterStream, 'trend')

    expect(afterTravel).toEqual({ travel: false, stream: true, trend: true })
    expect(initial.travel).toBe(true)
    expect(isPetTired(afterStream)).toBe(false)
    expect(isPetTired(afterTrend)).toBe(true)
  })
})
