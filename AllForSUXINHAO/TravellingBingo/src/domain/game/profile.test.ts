import { describe, expect, it } from 'vitest'

import { createInitialGameState } from './createGameState'
import { isValidDisplayName, normalizeDisplayName } from './profile'

describe('V3 用户名', () => {
  it('trim 后按 Unicode code point 接受 1–16 个字符', () => {
    expect(normalizeDisplayName('  小饼  ')).toBe('小饼')
    expect(normalizeDisplayName('🍎饼狗')).toBe('🍎饼狗')
    expect(normalizeDisplayName('一'.repeat(16))).toBe('一'.repeat(16))
    expect(() => normalizeDisplayName('   ')).toThrow(RangeError)
    expect(() => normalizeDisplayName('一'.repeat(17))).toThrow(RangeError)
  })

  it('新档持久化规范化名字，旧调用缺省为“你”', () => {
    expect(
      createInitialGameState({ now: 0, seed: 'named', displayName: '  苹果同学 ' }).profile,
    ).toMatchObject({ displayName: '苹果同学', companionDays: 0 })
    expect(createInitialGameState({ now: 0, seed: 'fallback' }).profile.displayName).toBe('你')
    expect(isValidDisplayName('苹果同学')).toBe(true)
    expect(isValidDisplayName(' 苹果同学 ')).toBe(false)
  })
})
