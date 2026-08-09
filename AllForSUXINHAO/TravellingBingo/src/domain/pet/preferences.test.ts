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

  it('偏好序列到达安全整数上限后饱和，不生成不可导出的下一值', () => {
    const generated = generateActivityPreferences('preference-cap', Number.MAX_SAFE_INTEGER)
    expect(generated.nextSequence).toBe(Number.MAX_SAFE_INTEGER)
    expect(Object.values(generated.preferences).some(Boolean)).toBe(true)
  })

  it('三个兴趣都能独立成为愿意或拒绝项，并覆盖拒绝 0/1/2 项', () => {
    const values = {
      travel: new Set<boolean>(),
      computer: new Set<boolean>(),
      music: new Set<boolean>(),
    }
    const refusalCounts = new Set<number>()

    for (let sequence = 0; sequence < 300; sequence += 1) {
      const preferences = generateActivityPreferences('preference-coverage', sequence).preferences
      values.travel.add(preferences.travel)
      values.computer.add(preferences.computer)
      values.music.add(preferences.music)
      refusalCounts.add(Object.values(preferences).filter((willing) => !willing).length)
    }

    expect(values).toEqual({
      travel: new Set([true, false]),
      computer: new Set([true, false]),
      music: new Set([true, false]),
    })
    expect(refusalCounts).toEqual(new Set([0, 1, 2]))
  })

  it('刷播与冲热共享电脑意愿，三项兴趣都耗尽时进入疲惫状态', () => {
    const initial = { travel: true, computer: true, music: true }
    const afterTravel = exhaustActivityPreference(initial, 'travel')
    const afterStream = exhaustActivityPreference(afterTravel, 'stream')
    const afterTrend = exhaustActivityPreference(afterStream, 'trend')
    const afterMusic = exhaustActivityPreference(afterTrend, 'music')

    expect(afterTravel).toEqual({ travel: false, computer: true, music: true })
    expect(afterStream.computer).toBe(false)
    expect(afterTrend).toEqual(afterStream)
    expect(initial.travel).toBe(true)
    expect(isPetTired(afterStream)).toBe(false)
    expect(isPetTired(afterMusic)).toBe(true)
  })
})
