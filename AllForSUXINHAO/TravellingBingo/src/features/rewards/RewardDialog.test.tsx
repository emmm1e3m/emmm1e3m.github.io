import { render, screen } from '@testing-library/react'

import type { CollectibleItem, ContentCatalog, FriendItem } from '@/content'
import type { ClaimSummary } from '@/domain'

import { RewardDialog } from './RewardDialog'

const postcard = {
  id: 'postcard-test',
  category: 'postcard',
  title: '山海明信片',
  alt: '一张山海明信片',
  images: [
    {
      width: 480,
      height: 640,
      path: 'assets/collectibles/postcards/test.webp',
      byteLength: 1,
      mime: 'image/webp',
      sha256: '0'.repeat(64),
    },
  ],
  tags: ['山海'],
  source: { url: 'https://example.com/postcard' },
} as unknown as CollectibleItem

const friend = {
  id: 'signal-dog',
  name: '信号狗',
  kind: 'dog',
  description: '总会带着好消息出现。',
  alt: '站着挥手的信号狗',
  image: {
    width: 512,
    height: 512,
    path: 'assets/friends/signal-dog.webp',
    byteLength: 1,
    mime: 'image/webp',
    sha256: '0'.repeat(64),
  },
  sourceCell: 4,
} as FriendItem

const catalog: ContentCatalog = {
  items: [postcard],
  byId: { [postcard.id]: postcard },
  categoryCounts: { postcard: 1, 'million-shot': 0, 'site-first': 0 },
  siteFirstChronology: [],
  friends: [friend],
  friendById: { [friend.id]: friend },
  videosByBvid: {},
  recordPlayerVideos: [],
}

function summary(overrides: Partial<ClaimSummary> = {}): ClaimSummary {
  return {
    runId: 'reward-run',
    kind: 'travel',
    apples: { base: 0, modifier: 0, duplicateCompensation: 0, total: 0 },
    collection: null,
    friendId: null,
    giftItemId: null,
    giftApples: 0,
    guaranteedByPity: false,
    ...overrides,
  }
}

describe('RewardDialog', () => {
  it('新明信片不显示活动完成标签', () => {
    render(
      <RewardDialog
        reward={summary({
          collection: { id: postcard.id, category: 'postcard', duplicate: false },
        })}
        catalog={catalog}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('旅途中遇见一份风景')).toBeInTheDocument()
    expect(screen.queryByText('Bingo 完成')).not.toBeInTheDocument()
  })

  it('展示遇见的朋友、礼物与 N🍎', () => {
    render(
      <RewardDialog
        reward={summary({
          kind: 'music',
          friendId: friend.id,
          giftItemId: 'lucky-apple',
          giftApples: 3,
          apples: { base: 3, modifier: 0, duplicateCompensation: 0, total: 3 },
        })}
        catalog={catalog}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('信号狗循着音乐来啦')).toBeInTheDocument()
    expect(screen.getByText('送来一份幸运苹果')).toBeInTheDocument()
    expect(screen.getByText('还送来 3🍎')).toBeInTheDocument()
    expect(document.querySelector('.reward-mascot > .mascot-sprite')).toBeInTheDocument()
  })
})
