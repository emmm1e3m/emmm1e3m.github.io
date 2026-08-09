import { render, screen } from '@testing-library/react'

import { createInitialGameState, deriveActivityTiming } from '@/domain'

import gameV4Styles from './game-v4.css?raw'
import { GameHud } from './GameHud'

describe('GameHud', () => {
  it('移动端苹果、收藏墙和调试入口保留至少 44px 的真实触控面', () => {
    expect(gameV4Styles).toContain(
      '.game-page--v4 .game-hud--v4 .hud-icon--album {\n  width: 44px;\n  min-width: 44px;\n  height: 44px;\n  flex: 0 0 44px;',
    )
    expect(gameV4Styles).toContain(
      '.game-page--v4 .game-hud--v4 .apple-counter,\n.game-page--v4 .game-hud--v4 .hud-icon--album,\n.game-page--v4 .game-hud--v4 .debug-chip {\n  min-height: 44px;',
    )
    expect(gameV4Styles).toContain(
      '.game-page--v4 .game-hud--v4 .apple-counter {\n  min-width: 44px;',
    )
  })

  it('用单行完整句显示 V4 顶栏中心文案', () => {
    const game = createInitialGameState({ now: 1_000, seed: 'v4-hud-copy' })

    render(
      <GameHud
        game={game}
        activity={null}
        timing={deriveActivityTiming(null, 1_000)}
        dirty={false}
        statusLabel="状态很好"
        vitalityDays={0}
        onExit={vi.fn()}
        onCenter={vi.fn()}
        onFridge={vi.fn()}
        onAlbum={vi.fn()}
        onDebug={vi.fn()}
      />,
    )

    const center = screen.getByRole('button', { name: '今天也要好好吃苹果' })
    expect(center).toHaveClass('game-hud__center')
    expect(center.querySelector('strong')).toHaveTextContent('今天也要好好吃苹果')
    expect(screen.queryByText('今天也要')).not.toBeInTheDocument()
    expect(center.closest('header')).toHaveClass('game-hud--v4')
    expect(screen.getByRole('status', { name: '饼狗状态' }).closest('header')).toBe(
      center.closest('header'),
    )
    expect(screen.getByRole('status', { name: '饼狗状态' })).toHaveTextContent(
      '状态很好你陪伴饼狗已经 0 天',
    )
  })
})
