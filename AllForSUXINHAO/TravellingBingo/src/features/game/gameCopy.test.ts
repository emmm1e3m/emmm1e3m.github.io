import { ITEM_IDS } from '@/domain'

import { ACTIVITY_COPY, ITEM_COPY } from './gameCopy'

describe('ITEM_COPY', () => {
  it('为全部冰箱道具提供稳定且可区分的 emoji', () => {
    expect(Object.keys(ITEM_COPY)).toEqual(ITEM_IDS)
    expect(Object.fromEntries(ITEM_IDS.map((itemId) => [itemId, ITEM_COPY[itemId].emoji]))).toEqual(
      {
        'travel-basic': '🍱',
        'travel-apple': '🍎',
        'signal-headphones': '🎧',
        'trend-toolbox': '🧰',
        'lucky-apple': '🍀',
        'bottled-speed-magic': '⚡',
        'bottled-vitality-magic': '✨',
      },
    )
  })

  it('明确说明苹果便当与幸运苹果分别增加一份常规概率', () => {
    expect(ITEM_COPY['travel-apple'].note).toBe('常规遇友概率增加 100%')
    expect(ITEM_COPY['lucky-apple'].note).toBe('常规收藏概率增加 100%')
  })

  it('弹琴说明认识更多朋友会提高来访与苹果收益期望', () => {
    expect(ACTIVITY_COPY.music.note).toBe(
      '认识的朋友越多，琴声越容易唤来熟悉的朋友，也越可能收到更多苹果。',
    )
  })
})
