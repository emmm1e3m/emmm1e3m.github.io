import { describe, expect, it } from 'vitest'

import { isPcBrowser } from './browserPlatform'

describe('isPcBrowser', () => {
  it('允许具备桌面主输入能力的浏览器', () => {
    expect(isPcBrowser({ hasDesktopPointer: true })).toBe(true)
  })

  it('拒绝仅有触摸主输入能力的浏览器', () => {
    expect(isPcBrowser({ hasDesktopPointer: false })).toBe(false)
  })
})
