import { describe, expect, it } from 'vitest'

import { deriveActivityTiming } from '../activities/timing'
import { createInitialGameState } from './createGameState'
import { assertValidTimestamp, isValidTimestamp, MAX_DATE_TIMESTAMP_MS } from './time'

describe('可展示时间戳边界', () => {
  it('接受 Date TimeClip 正向边界并拒绝会让 toISOString 抛错的下一毫秒', () => {
    expect(new Date(MAX_DATE_TIMESTAMP_MS).toISOString()).toBe('+275760-09-13T00:00:00.000Z')
    expect(isValidTimestamp(MAX_DATE_TIMESTAMP_MS)).toBe(true)
    expect(isValidTimestamp(MAX_DATE_TIMESTAMP_MS + 1)).toBe(false)
    expect(() => assertValidTimestamp(MAX_DATE_TIMESTAMP_MS + 1, '时间超出范围')).toThrow(
      RangeError,
    )
  })

  it('建档和活动时序派生复用同一边界', () => {
    expect(
      createInitialGameState({ now: MAX_DATE_TIMESTAMP_MS, seed: 'date-boundary' }).profile
        .createdAt,
    ).toBe(MAX_DATE_TIMESTAMP_MS)
    expect(() =>
      createInitialGameState({ now: MAX_DATE_TIMESTAMP_MS + 1, seed: 'date-overflow' }),
    ).toThrow(RangeError)
    expect(deriveActivityTiming(null, MAX_DATE_TIMESTAMP_MS).phase).toBe('idle')
    expect(() => deriveActivityTiming(null, MAX_DATE_TIMESTAMP_MS + 1)).toThrow(RangeError)
  })
})
