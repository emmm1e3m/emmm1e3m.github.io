import { render, screen } from '@testing-library/react'

import { createInitialGameState, deriveActivityTiming } from '@/domain'

import globalStyles from '@/styles/global.css?raw'

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
    const initial = createInitialGameState({ now: 1_000, seed: 'v4-hud-copy' })
    const game = {
      ...initial,
      pet: {
        ...initial.pet,
        preferences: { travel: true, computer: true, music: true },
        tired: false,
      },
    }

    render(
      <GameHud
        game={game}
        now={1_000}
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
      '状态很好高活力你陪伴饼狗已经 0 天',
    )
    expect(screen.getByLabelText('活力状态 高活力')).toBeInTheDocument()
  })

  it('独立显示活力状态，不覆盖正在进行的活动文案', () => {
    const initial = createInitialGameState({ now: 1_000, seed: 'v4-hud-vitality' })
    const game = {
      ...initial,
      pet: {
        ...initial.pet,
        preferences: { travel: true, computer: true, music: false },
        tired: false,
      },
    }
    const props = {
      now: 1_000,
      activity: null,
      timing: deriveActivityTiming(null, 1_000),
      dirty: false,
      statusLabel: '正在弹琴',
      vitalityDays: 0,
      onExit: vi.fn(),
      onCenter: vi.fn(),
      onFridge: vi.fn(),
      onAlbum: vi.fn(),
      onDebug: vi.fn(),
    } as const
    const { rerender } = render(<GameHud {...props} game={game} />)

    const status = screen.getByRole('status', { name: '饼狗状态' })
    expect(status).toHaveTextContent('正在弹琴')
    expect(status).toHaveTextContent('中等活力')

    rerender(
      <GameHud
        {...props}
        game={{
          ...game,
          player: {
            effects: {
              vitality: {
                activatedAt: 1_000,
                activatedOnCompanionDay: 0,
                expiresAfterCompanionDay: 7,
              },
            },
          },
        }}
      />,
    )
    expect(status).toHaveTextContent('活力满满')
  })

  it('为顶栏各块分别提供协调的圆角矩形背景', () => {
    for (const [selector, color] of [
      ['.game-hud--v4 .exit-button--text', '#f8e2dc'],
      ['.game-hud--v4 .game-hud__center', '#fff1dc'],
      ['.game-page--v4 .pet-status-bar', '#f8eee4'],
      ['.game-hud--v4 .apple-counter', '#ffe9c9'],
      ['.game-hud--v4 .hud-icon--album', '#f7dfdf'],
      ['.game-hud--v4 .debug-chip', '#eee3f2'],
    ] as const) {
      expect(gameV4Styles).toMatch(
        new RegExp(
          `${selector.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\{[^}]*background:\\s*${color};`,
          'su',
        ),
      )
    }
    expect(gameV4Styles).toMatch(
      /\.game-hud--v4 \.reality-stay-timer,\s*\.game-hud--v4 \.visitor-stream-timer\s*\{[^}]*background:\s*#e5eff2;/su,
    )
    expect(gameV4Styles).toMatch(
      /\.game-hud--v4 \.exit-button--text,[^}]*\.game-page--v4 \.pet-status-bar,[^}]*\{[^}]*border-radius:\s*14px !important;/su,
    )
  })

  it('1200px 以下保持单行流式布局，空间不足时整条顶栏横向浏览', () => {
    expect(gameV4Styles).toMatch(
      /@media \(max-width: 1200px\)\s*\{[\s\S]*?\.game-page--v4 \.game-hud--v4\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/u,
    )
    expect(gameV4Styles).toMatch(
      /@media \(max-width: 1200px\)\s*\{[\s\S]*?\.game-hud--v4 \.game-hud__center\s*\{[^}]*position:\s*static;[^}]*min-width:\s*max-content;[^}]*flex:\s*0 0 auto;[^}]*transform:\s*none;/u,
    )
    expect(gameV4Styles).toMatch(
      /@media \(max-width: 1200px\)\s*\{[\s\S]*?\.game-hud--v4 \.game-hud__actions\s*\{[^}]*min-width:\s*max-content;[^}]*display:\s*flex;[^}]*flex:\s*0 0 auto;/u,
    )
    expect(gameV4Styles).not.toContain("'companion companion buttons'")
    expect(gameV4Styles).not.toContain("'actions actions actions'")
  })

  it('现实停留计时只由 enteredAt 与传入 now 格式化，回到游戏后隐藏', () => {
    const base = createInitialGameState({ now: 1_000, seed: 'v4-reality-timer' })
    const reality = {
      ...base,
      world: 'reality' as const,
      reality: {
        ...base.reality,
        activeStay: { stayId: 'hud-stay', enteredAt: 1_000 },
      },
    }
    const props = {
      activity: null,
      timing: deriveActivityTiming(null, 1_000),
      dirty: false,
      statusLabel: '状态正常',
      vitalityDays: 0,
      onExit: vi.fn(),
      onCenter: vi.fn(),
      onFridge: vi.fn(),
      onAlbum: vi.fn(),
      onDebug: vi.fn(),
    } as const
    const { rerender } = render(<GameHud {...props} game={reality} now={62_000} />)

    expect(screen.getByRole('timer', { name: '本次现实停留 01:01' })).toHaveTextContent(
      '现实 01:01',
    )
    rerender(<GameHud {...props} game={reality} now={3_662_000} />)
    expect(screen.getByRole('timer', { name: '本次现实停留 01:01:01' })).toBeInTheDocument()
    rerender(<GameHud {...props} game={base} now={3_662_000} />)
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('全站默认与可点击区域使用 CSS 内联 SVG 场景指针', () => {
    expect(globalStyles).toMatch(/--scene-cursor-default:\s*url\("data:image\/svg\+xml,/su)
    expect(globalStyles).toMatch(/--scene-cursor-action:\s*url\("data:image\/svg\+xml,/su)
    expect(globalStyles).toMatch(
      /html,\s*body,\s*body \*\s*\{\s*cursor:\s*var\(--scene-cursor-default\) !important;/su,
    )
    expect(globalStyles).toContain('cursor: var(--scene-cursor-action) !important;')
  })
})
