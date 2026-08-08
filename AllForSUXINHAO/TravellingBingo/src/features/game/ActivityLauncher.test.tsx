import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { CollectibleItem, ContentCatalog } from '@/content'
import {
  createInitialGameState,
  type ActivityKind,
  type CollectionCatalog,
  type GameState,
} from '@/domain'

import { ActivityLauncher } from './ActivityLauncher'
import { ContextPanel } from './ContextPanel'

const catalog: CollectionCatalog = {
  postcard: ['postcard-test'],
  'million-shot': ['million-shot-test'],
  'site-first': ['site-first-test'],
  siteFirstChronology: ['site-first-test'],
}

const millionShot = {
  id: 'million-shot-test',
  category: 'million-shot',
  title: '测试百万直拍',
} as CollectibleItem

const siteFirst = {
  id: 'site-first-test',
  category: 'site-first',
  title: '测试全站第一',
  metadata: { chronology: 1 },
} as CollectibleItem

const contentCatalog: ContentCatalog = {
  items: [millionShot, siteFirst],
  byId: {
    [millionShot.id]: millionShot,
    [siteFirst.id]: siteFirst,
  },
  categoryCounts: { postcard: 0, 'million-shot': 1, 'site-first': 1 },
  siteFirstChronology: [siteFirst.id],
}

function playableGame(): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'lucky-apple-ui-test' })
  return {
    ...game,
    inventory: {
      ...game.inventory,
      'travel-basic': 1,
      'signal-headphones': 1,
      'trend-toolbox': 1,
      'lucky-apple': 2,
    },
    pet: {
      ...game.pet,
      preferences: { travel: true, stream: true, trend: true },
      tired: false,
    },
  }
}

function renderLauncher(kind: ActivityKind, game: GameState, onAction = vi.fn()) {
  const view = render(
    <ActivityLauncher
      kind={kind}
      game={game}
      catalog={catalog}
      onAction={onAction}
      onNeedSupplies={vi.fn()}
      onNeedRest={vi.fn()}
    />,
  )
  return { ...view, onAction }
}

describe('幸运苹果活动边界', () => {
  it('旅行本来就会带回回忆时禁用幸运苹果，并以普通方式开始', () => {
    const { onAction } = renderLauncher('travel', playableGame())
    const luckyButton = screen.getByRole('button', { name: /带上幸运苹果/u })

    expect(luckyButton).toBeDisabled()
    expect(luckyButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('note')).toHaveTextContent('这次的回忆已经稳稳在路上了')
    expect(screen.queryByText(/100%/u)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '开始出去旅行' }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activity/start',
        kind: 'travel',
        useLuckyApple: false,
      }),
    )
  })

  it('对应分类收齐后禁用幸运苹果并说明把它留给下一次惊喜', () => {
    const game = playableGame()
    renderLauncher('stream', {
      ...game,
      collections: {
        'million-shot-test': {
          id: 'million-shot-test',
          firstObtainedAt: 1_000,
          duplicateCount: 0,
        },
      },
    })

    expect(screen.getByRole('button', { name: /带上幸运苹果/u })).toBeDisabled()
    expect(screen.getByRole('note')).toHaveTextContent(
      '这一类回忆已经收齐啦，把幸运苹果留给下一次惊喜吧。',
    )
  })

  it('仍有新收藏时可以带上，并在活动开始时提交统一领域参数', () => {
    const { onAction } = renderLauncher('stream', playableGame())
    const luckyButton = screen.getByRole('button', { name: /带上幸运苹果/u })

    expect(luckyButton).toBeEnabled()
    fireEvent.click(luckyButton)
    expect(luckyButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '开始认真刷播' }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'activity/start',
        kind: 'stream',
        useLuckyApple: true,
      }),
    )
  })

  it('收藏状态改变使幸运苹果失效时立即清掉已选状态', async () => {
    const game = playableGame()
    const onAction = vi.fn()
    const { rerender } = renderLauncher('stream', game, onAction)
    fireEvent.click(screen.getByRole('button', { name: /带上幸运苹果/u }))

    rerender(
      <ActivityLauncher
        kind="stream"
        game={{
          ...game,
          collections: {
            'million-shot-test': {
              id: 'million-shot-test',
              firstObtainedAt: 2_000,
              duplicateCount: 0,
            },
          },
        }}
        catalog={catalog}
        onAction={onAction}
        onNeedSupplies={vi.fn()}
        onNeedRest={vi.fn()}
      />,
    )

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /带上幸运苹果/u })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '开始认真刷播' }))
    expect(onAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'activity/start', useLuckyApple: false }),
    )
  })
})

describe('活动面板目录复用', () => {
  afterEach(() => vi.useRealTimers())

  it('每秒更新时间后仍保留当前幸运苹果选择', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const game = playableGame()
    const commonProps = {
      panel: 'computer' as const,
      game,
      catalog: contentCatalog,
      onNavigate: vi.fn(),
      onAction: vi.fn(),
      onBackup: vi.fn(),
      onTaskEvent: vi.fn(),
    }
    const { rerender } = render(<ContextPanel {...commonProps} now={Date.now()} />)
    const luckyButton = screen.getAllByRole('button', { name: /带上幸运苹果/u })[0]

    fireEvent.click(luckyButton)
    expect(luckyButton).toHaveAttribute('aria-pressed', 'true')

    vi.advanceTimersByTime(1_000)
    rerender(<ContextPanel {...commonProps} now={Date.now()} />)

    expect(screen.getAllByRole('button', { name: /幸运苹果/u })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
