import { act, fireEvent, render, screen } from '@testing-library/react'

import { createInitialGameState, type GameState } from '@/domain'

import globalStyles from '@/styles/global.css?raw'

import gameV3Styles from './game-v3.css?raw'
import gameV4Styles from './game-v4.css?raw'
import playerStyles from '../player/player.css?raw'
import { RoomScene } from './RoomScene'
import { DEFAULT_ROOM_AREA, ROOM_AREAS, ROOM_CANVAS, type RoomArea } from './roomConfig'
import {
  GAME_ROOM_WANDER_HULL,
  randomRoomPointInHull,
  randomRoomWanderDuration,
  roomPointInsideConvexHull,
  ROOM_WANDER_MOVE_MAX_MS,
  ROOM_WANDER_MOVE_MIN_MS,
  ROOM_WANDER_REST_MAX_MS,
  ROOM_WANDER_REST_MIN_MS,
} from './roomWander'

function activeGame(kind: 'music' | 'rest' | 'travel'): GameState {
  const game = createInitialGameState({ now: 1_000, seed: `room-scene-${kind}` })
  return {
    ...game,
    activeActivity: {
      runId: `${kind}-run`,
      kind,
      startedAt: 1_000,
      endsAt: 113_000,
      rewardSeed: `${kind}-reward`,
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: null,
        friendId: null,
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: null,
      usedLuckyApple: false,
    },
  }
}

function renderRoom({
  game = createInitialGameState({ now: 1_000, seed: 'room-scene' }),
  area = DEFAULT_ROOM_AREA,
  panel = null,
  onArea = vi.fn(),
  onPetCenterChange,
  onReluctantArea,
  onPanel = vi.fn(),
  onBackgroundActivate = vi.fn(),
  onRequestCancelActivity,
  pomodoroRunning,
  onRequestCancelPomodoro,
  dimensionToggleDisabled,
  onToggleDimension,
  wanderRandom,
  petMenuOpenRequest,
}: {
  game?: GameState
  area?: RoomArea
  panel?: Parameters<typeof RoomScene>[0]['panel']
  onArea?: Parameters<typeof RoomScene>[0]['onArea']
  onPetCenterChange?: Parameters<typeof RoomScene>[0]['onPetCenterChange']
  onReluctantArea?: Parameters<typeof RoomScene>[0]['onReluctantArea']
  onPanel?: Parameters<typeof RoomScene>[0]['onPanel']
  onBackgroundActivate?: Parameters<typeof RoomScene>[0]['onBackgroundActivate']
  onRequestCancelActivity?: Parameters<typeof RoomScene>[0]['onRequestCancelActivity']
  pomodoroRunning?: Parameters<typeof RoomScene>[0]['pomodoroRunning']
  onRequestCancelPomodoro?: Parameters<typeof RoomScene>[0]['onRequestCancelPomodoro']
  dimensionToggleDisabled?: Parameters<typeof RoomScene>[0]['dimensionToggleDisabled']
  onToggleDimension?: Parameters<typeof RoomScene>[0]['onToggleDimension']
  wanderRandom?: Parameters<typeof RoomScene>[0]['wanderRandom']
  petMenuOpenRequest?: Parameters<typeof RoomScene>[0]['petMenuOpenRequest']
} = {}) {
  return render(
    <RoomScene
      game={game}
      panel={panel}
      area={area}
      walking={false}
      walkingDirection="right"
      sleeping={false}
      restDarkness={0}
      onArea={onArea}
      onPetCenterChange={onPetCenterChange}
      onReluctantArea={onReluctantArea}
      onPanel={onPanel}
      onBackgroundActivate={onBackgroundActivate}
      onRequestCancelActivity={onRequestCancelActivity}
      pomodoroRunning={pomodoroRunning}
      onRequestCancelPomodoro={onRequestCancelPomodoro}
      onHelp={vi.fn()}
      dimensionToggleDisabled={dimensionToggleDisabled}
      onToggleDimension={onToggleDimension}
      onTaskEvent={vi.fn()}
      wanderRandom={wanderRandom}
      petMenuOpenRequest={petMenuOpenRequest}
    />,
  )
}

describe('房屋场景定位与返回交互', () => {
  it('只渲染一层等比房屋图片，坐标层居中且不占用两侧透明留白', () => {
    renderRoom()

    const room = screen.getByRole('region', { name: '铲铲饼屋互动场景' })
    expect(room.style.getPropertyValue('--room-backdrop-image')).toBe('')
    expect(room.querySelectorAll('.room-stage')).toHaveLength(1)
    expect(room.querySelectorAll('.room-picture')).toHaveLength(1)
    expect(room.querySelectorAll('.room-picture img[src*="chan-chan-house-v2-"]')).toHaveLength(1)
    expect(room.querySelector('.room-bingo-badge')).toBeNull()

    expect(gameV3Styles).not.toContain('var(--room-backdrop-image)')
    expect(gameV3Styles).toMatch(
      /\.room-stage\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*width:\s*auto;[^}]*height:\s*100%;[^}]*aspect-ratio:\s*1098\s*\/\s*1433;[^}]*transform:\s*translateX\(-50%\);/su,
    )
    expect(gameV3Styles).toMatch(
      /\.room-card--v3 \.room-picture img\s*\{[^}]*object-fit:\s*contain;/su,
    )
    expect(gameV3Styles).toMatch(
      /\.game-page--v3 \.room-card--v3\s*\{[^}]*background:\s*transparent;/su,
    )
  })

  it('饼狗菜单跟随当前可见坐标，并按所在楼层选择上下方且保持活力状态单行', () => {
    const fridge = ROOM_AREAS.find((area) => area.id === 'fridge')!
    const { rerender } = renderRoom({ area: fridge, panel: 'fridge' })

    fireEvent.click(screen.getByRole('button', { name: '饼狗，打开行动菜单' }))
    let menu = screen.getByRole('dialog', { name: '饼狗状态' })
    expect(menu).toHaveClass('pet-menu--above')
    expect(Number.parseFloat(menu.style.getPropertyValue('--pet-menu-x'))).toBeCloseTo(
      (fridge.petCenter.x / ROOM_CANVAS.width) * 100,
      12,
    )
    expect(Number.parseFloat(menu.style.getPropertyValue('--pet-menu-y'))).toBeCloseTo(
      (fridge.petCenter.y / ROOM_CANVAS.height) * 100,
      12,
    )

    const bed = ROOM_AREAS.find((area) => area.id === 'bed')!
    rerender(
      <RoomScene
        game={createInitialGameState({ now: 1_000, seed: 'room-menu-follow' })}
        panel="rest"
        area={bed}
        walking
        walkingDirection="left"
        sleeping={false}
        restDarkness={0}
        onArea={vi.fn()}
        onPanel={vi.fn()}
        onBackgroundActivate={vi.fn()}
        onHelp={vi.fn()}
        onTaskEvent={vi.fn()}
      />,
    )
    menu = screen.getByRole('dialog', { name: '饼狗状态' })
    expect(menu).toHaveClass('pet-menu--below', 'is-following-pet')
    expect(Number.parseFloat(menu.style.getPropertyValue('--pet-menu-x'))).toBeCloseTo(
      (bed.petCenter.x / ROOM_CANVAS.width) * 100,
      12,
    )
    expect(gameV3Styles).toMatch(
      /\.pet-menu__vitality\s*\{[^}]*display:\s*flex;[^}]*white-space:\s*nowrap;/su,
    )
  })

  it('外部打开请求只处理一次，并复用点击饼狗的任务事件', async () => {
    const onTaskEvent = vi.fn()
    const game = createInitialGameState({ now: 1_000, seed: 'room-menu-request' })
    const commonProps = {
      game,
      panel: 'status' as const,
      area: DEFAULT_ROOM_AREA,
      walking: false,
      walkingDirection: 'right' as const,
      sleeping: false,
      restDarkness: 0,
      onArea: vi.fn(),
      onPanel: vi.fn(),
      onBackgroundActivate: vi.fn(),
      onHelp: vi.fn(),
      onTaskEvent,
    }
    const { rerender, unmount } = render(<RoomScene {...commonProps} petMenuOpenRequest={0} />)

    rerender(<RoomScene {...commonProps} petMenuOpenRequest={1} />)
    await act(
      () =>
        new Promise<void>((resolve) => {
          globalThis.requestAnimationFrame(() => resolve())
        }),
    )
    expect(screen.getByRole('dialog', { name: '饼狗状态' })).toBeInTheDocument()
    expect(onTaskEvent).toHaveBeenCalledTimes(1)

    rerender(<RoomScene {...commonProps} petMenuOpenRequest={1} />)
    expect(onTaskEvent).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '收起菜单' }))
    unmount()
    render(<RoomScene {...commonProps} petMenuOpenRequest={1} />)
    await act(
      () =>
        new Promise<void>((resolve) => {
          globalThis.requestAnimationFrame(() => resolve())
        }),
    )
    expect(screen.queryByRole('dialog', { name: '饼狗状态' })).not.toBeInTheDocument()
    expect(onTaskEvent).toHaveBeenCalledTimes(1)
  })

  it('房间、信息栏和播放器的可见留白只使用一份场景间距', () => {
    expect(globalStyles).toContain('--scene-component-gap: clamp(10px, 0.8vw, 14px);')
    expect(gameV3Styles).toContain('--shell-gap: var(--scene-component-gap);')
    expect(gameV4Styles).toMatch(
      /\.game-page--v4 \.game-layout--v3\.has-side-panel\s*\{[^}]*column-gap:\s*var\(--scene-component-gap\);/su,
    )
    expect(gameV4Styles).toMatch(
      /\.persistent-bilibili-player--context\) \.game-page--v4 \.context-stack\s*\{[^}]*var\(--scene-player-collapsed-block-size\) \+ var\(--scene-component-gap\)/su,
    )
    expect(gameV4Styles).toMatch(
      /\.persistent-bilibili-player--context\.is-expanded\) \.game-page--v4 \.context-stack\s*\{[^}]*var\(--scene-player-expanded-block-size\) \+ var\(--scene-component-gap\)/su,
    )
    expect(playerStyles).toMatch(
      /\.persistent-bilibili-player--context\s*\{[^}]*--player-dock-bottom:\s*var\(--scene-component-gap\);[^}]*height:\s*var\(--scene-player-collapsed-block-size\);/su,
    )
    expect(playerStyles).toMatch(
      /\.persistent-bilibili-player--context\.is-expanded\s*\{[^}]*height:\s*var\(--scene-player-expanded-block-size\);/su,
    )
  })

  it.each(ROOM_AREAS)('$label 的饼狗中心由母版像素严格换算', (area) => {
    renderRoom({ area, panel: area.panel })

    const mascot = screen.getByRole('button', { name: '饼狗，打开行动菜单' })
    expect(Number.parseFloat(mascot.style.getPropertyValue('--pet-x'))).toBeCloseTo(
      (area.petCenter.x / ROOM_CANVAS.width) * 100,
      12,
    )
    expect(Number.parseFloat(mascot.style.getPropertyValue('--pet-y'))).toBeCloseTo(
      (area.petCenter.y / ROOM_CANVAS.height) * 100,
      12,
    )
  })

  it('待机时先休息再向左移动，到达休息后再向右移动', () => {
    vi.useFakeTimers()
    const randomValues = [0.05, 0.2, 0.2, 0, 0.85, 0.8, 0.8, 0, 1, 1, 1, 0, 0]
    const random = vi.fn(() => randomValues.shift() ?? 0.5)

    try {
      const game = createInitialGameState({ now: 1_000, seed: 'room-scene-wander' })
      const { rerender, unmount } = renderRoom({ game, panel: 'status', wanderRandom: random })
      const mascot = screen.getByRole('button', { name: '饼狗，打开行动菜单' })

      expect(mascot).toHaveClass('is-wandering', 'is-wander-resting')
      expect(mascot).not.toHaveClass('is-wander-moving')
      expect(mascot.querySelector('.mascot-sprite')).toHaveClass('mascot-sprite--idle')
      const readPoint = () => ({
        x: (Number.parseFloat(mascot.style.getPropertyValue('--pet-x')) / 100) * ROOM_CANVAS.width,
        y: (Number.parseFloat(mascot.style.getPropertyValue('--pet-y')) / 100) * ROOM_CANVAS.height,
      })
      const firstPoint = readPoint()
      expect(roomPointInsideConvexHull(firstPoint, GAME_ROOM_WANDER_HULL)).toBe(true)
      expect(ROOM_AREAS.some((candidate) => candidate.petCenter.x === firstPoint.x)).toBe(false)

      act(() => vi.advanceTimersByTime(ROOM_WANDER_REST_MIN_MS - 1))
      expect(mascot).toHaveClass('is-wander-resting')
      expect(readPoint()).toEqual(firstPoint)

      act(() => vi.advanceTimersByTime(1))
      const targetPoint = readPoint()
      expect(mascot).toHaveClass('is-wandering', 'is-wander-moving')
      expect(mascot).toHaveClass('is-facing-left')
      expect(mascot).not.toHaveClass('is-wander-resting')
      expect(mascot.querySelector('.mascot-sprite')).toHaveClass('mascot-sprite--walk')
      expect(mascot.style.getPropertyValue('--pet-wander-duration')).toBe(
        `${ROOM_WANDER_MOVE_MIN_MS}ms`,
      )
      expect(roomPointInsideConvexHull(targetPoint, GAME_ROOM_WANDER_HULL)).toBe(true)
      expect(targetPoint.x).toBeLessThan(firstPoint.x)

      act(() => vi.advanceTimersByTime(ROOM_WANDER_MOVE_MIN_MS - 1))
      expect(mascot).toHaveClass('is-wander-moving')
      act(() => vi.advanceTimersByTime(1))
      expect(mascot).toHaveClass('is-wander-resting')
      expect(mascot).not.toHaveClass('is-wander-moving', 'is-facing-left')
      expect(mascot.querySelector('.mascot-sprite')).toHaveClass('mascot-sprite--idle')
      expect(readPoint()).toEqual(targetPoint)
      expect(mascot.style.getPropertyValue('--pet-wander-duration')).toBe(
        `${ROOM_WANDER_REST_MAX_MS}ms`,
      )

      act(() => vi.advanceTimersByTime(ROOM_WANDER_REST_MAX_MS))
      const rightTargetPoint = readPoint()
      expect(mascot).toHaveClass('is-wander-moving')
      expect(mascot).not.toHaveClass('is-facing-left')
      expect(rightTargetPoint.x).toBeGreaterThan(targetPoint.x)
      expect(roomPointInsideConvexHull(rightTargetPoint, GAME_ROOM_WANDER_HULL)).toBe(true)

      act(() => vi.advanceTimersByTime(ROOM_WANDER_MOVE_MIN_MS))
      expect(mascot).toHaveClass('is-wander-resting')
      expect(readPoint()).toEqual(rightTargetPoint)

      const fridge = ROOM_AREAS.find((candidate) => candidate.id === 'fridge')!
      rerender(
        <RoomScene
          game={game}
          panel="fridge"
          area={fridge}
          walking={false}
          walkingDirection="right"
          sleeping={false}
          restDarkness={0}
          onArea={vi.fn()}
          onPanel={vi.fn()}
          onBackgroundActivate={vi.fn()}
          onHelp={vi.fn()}
          onTaskEvent={vi.fn()}
          wanderRandom={random}
        />,
      )
      expect(mascot).not.toHaveClass('is-wandering')
      expect(Number.parseFloat(mascot.style.getPropertyValue('--pet-x'))).toBeCloseTo(
        (fridge.petCenter.x / ROOM_CANVAS.width) * 100,
        12,
      )
      const randomCalls = random.mock.calls.length
      act(() => vi.advanceTimersByTime(ROOM_WANDER_REST_MAX_MS * 2))
      expect(random).toHaveBeenCalledTimes(randomCalls)

      unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('休息与移动时长分别落在约定区间，移动样式使用同一计时值', () => {
    expect(randomRoomWanderDuration('resting', () => 0)).toBe(ROOM_WANDER_REST_MIN_MS)
    expect(randomRoomWanderDuration('resting', () => 1)).toBe(ROOM_WANDER_REST_MAX_MS)
    expect(randomRoomWanderDuration('moving', () => 0)).toBe(ROOM_WANDER_MOVE_MIN_MS)
    expect(randomRoomWanderDuration('moving', () => 1)).toBe(ROOM_WANDER_MOVE_MAX_MS)
    expect(gameV4Styles).toContain('.room-mascot--actor.is-wander-moving')
    expect(gameV4Styles).toContain('left var(--pet-wander-duration, 6.4s) ease-in-out')
    expect(gameV4Styles).toContain('top var(--pet-wander-duration, 6.4s) ease-in-out')
    expect(gameV4Styles).toMatch(
      /\.room-mascot--actor\.is-facing-left\s*>\s*\.mascot-sprite--walk\s*\{[^}]*transform:\s*scaleX\(-1\);/su,
    )
  })

  it('从设施返回待机时留在当前落点，停下休息只显示待机姿态', () => {
    vi.useFakeTimers()
    const fridge = ROOM_AREAS.find((candidate) => candidate.id === 'fridge')!

    try {
      const game = createInitialGameState({ now: 1_000, seed: 'room-scene-return-idle' })
      const commonProps = {
        game,
        area: fridge,
        walking: false,
        walkingDirection: 'right' as const,
        sleeping: false,
        restDarkness: 0,
        onArea: vi.fn(),
        onPanel: vi.fn(),
        onBackgroundActivate: vi.fn(),
        onHelp: vi.fn(),
        onTaskEvent: vi.fn(),
        wanderRandom: vi.fn(() => 0),
      }
      const { rerender } = render(<RoomScene {...commonProps} panel="fridge" />)
      const mascot = screen.getByRole('button', { name: '饼狗，打开行动菜单' })

      fireEvent.click(screen.getByRole('img', { name: /纵向展开的两层铲铲饼屋/u }))
      rerender(<RoomScene {...commonProps} panel="status" />)

      expect(mascot).toHaveClass('is-wandering', 'is-wander-resting')
      expect(mascot).not.toHaveClass('is-wander-moving')
      expect(mascot.querySelector('.mascot-sprite')).toHaveClass('mascot-sprite--idle')
      expect(Number.parseFloat(mascot.style.getPropertyValue('--pet-x'))).toBeCloseTo(
        (fridge.petCenter.x / ROOM_CANVAS.width) * 100,
        12,
      )
      expect(Number.parseFloat(mascot.style.getPropertyValue('--pet-y'))).toBeCloseTo(
        (fridge.petCenter.y / ROOM_CANVAS.height) * 100,
        12,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('纯函数生成的任意漫步点都在最大凸包内部且不只取设施落点', () => {
    let state = 7
    const random = () => {
      state = (state * 16807) % 2_147_483_647
      return state / 2_147_483_647
    }
    const facilityPoints = new Set(
      ROOM_AREAS.map((area) => `${area.petCenter.x},${area.petCenter.y}`),
    )

    for (let index = 0; index < 80; index += 1) {
      const point = randomRoomPointInHull(GAME_ROOM_WANDER_HULL, random)
      expect(roomPointInsideConvexHull(point, GAME_ROOM_WANDER_HULL)).toBe(true)
      expect(facilityPoints.has(`${point.x},${point.y}`)).toBe(false)
    }
  })

  it('系统减少动态效果时不启动待机漫步', () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )

    try {
      renderRoom({ panel: 'status', wanderRandom: vi.fn(() => 0.5) })
      expect(screen.getByRole('button', { name: '饼狗，打开行动菜单' })).not.toHaveClass(
        'is-wandering',
      )
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it('苹果钟运行时停止底层待机漫步且不保留计时器', () => {
    vi.useFakeTimers()
    const random = vi.fn(() => 0.5)

    try {
      renderRoom({ panel: 'status', pomodoroRunning: true, wanderRandom: random })
      const mascot = screen.getByRole('button', { name: '饼狗，打开行动菜单' })

      expect(mascot).not.toHaveClass('is-wandering', 'is-wander-moving', 'is-facing-left')
      expect(mascot.querySelector('.mascot-sprite')).toHaveClass('mascot-sprite--idle')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('睡觉时固定在设施落点并停用待机漫步', () => {
    vi.useFakeTimers()
    const random = vi.fn(() => 0.5)

    try {
      render(
        <RoomScene
          game={createInitialGameState({ now: 1_000, seed: 'room-scene-sleeping' })}
          panel="status"
          area={DEFAULT_ROOM_AREA}
          walking={false}
          walkingDirection="right"
          sleeping
          restDarkness={0.8}
          onArea={vi.fn()}
          onPanel={vi.fn()}
          onBackgroundActivate={vi.fn()}
          onHelp={vi.fn()}
          onTaskEvent={vi.fn()}
          wanderRandom={random}
        />,
      )

      const mascot = screen.getByRole('button', { name: '饼狗，打开行动菜单' })
      expect(mascot).not.toHaveClass('is-wandering', 'is-wander-moving')
      expect(mascot.querySelector('.mascot-sprite')).toHaveClass('mascot-sprite--sleep')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('点击房屋空白回到概览，但点击设施热点不会误触发', () => {
    const onArea = vi.fn()
    const onBackgroundActivate = vi.fn()
    renderRoom({ panel: 'fridge', onArea, onBackgroundActivate })

    fireEvent.click(
      screen.getByRole('img', {
        name: /纵向展开的两层铲铲饼屋/u,
      }),
    )
    expect(onBackgroundActivate).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '打开冰箱' }))
    expect(onArea).toHaveBeenCalledOnce()
    expect(onBackgroundActivate).toHaveBeenCalledOnce()
  })

  it('通过按下状态向辅助技术标明当前打开的设施面板', () => {
    renderRoom({ panel: 'fridge' })

    expect(screen.getByRole('button', { name: '打开冰箱' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '去电脑前' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('灰态热点额外发出一次活力提示请求，愿意态与现实维度不发出', () => {
    const base = createInitialGameState({ now: 1_000, seed: 'room-vitality-hotspot' })
    const reluctantGame: GameState = {
      ...base,
      pet: {
        ...base.pet,
        tired: false,
        preferences: { travel: true, computer: false, music: true },
      },
    }
    const onReluctantArea = vi.fn()
    const { rerender } = renderRoom({ game: reluctantGame, onReluctantArea })

    fireEvent.click(screen.getByRole('button', { name: '去电脑前' }))
    expect(onReluctantArea).toHaveBeenCalledOnce()
    expect(onReluctantArea).toHaveBeenCalledWith(
      expect.objectContaining({ panel: 'computer', interest: 'computer' }),
    )

    fireEvent.click(screen.getByRole('button', { name: '去门口' }))
    expect(onReluctantArea).toHaveBeenCalledOnce()

    rerender(
      <RoomScene
        game={{ ...reluctantGame, world: 'reality' }}
        panel={null}
        area={DEFAULT_ROOM_AREA}
        walking={false}
        walkingDirection="right"
        sleeping={false}
        restDarkness={0}
        onArea={vi.fn()}
        onReluctantArea={onReluctantArea}
        onPanel={vi.fn()}
        onBackgroundActivate={vi.fn()}
        onHelp={vi.fn()}
        onTaskEvent={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '刷播' }))
    expect(onReluctantArea).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '刷播' })).not.toHaveClass('is-reluctant')
  })

  it('冰箱落点重叠时设施热点优先可点，饼狗其余区域仍能打开菜单', () => {
    const onArea = vi.fn()
    const onTaskEvent = vi.fn()
    const fridge = ROOM_AREAS.find((area) => area.id === 'fridge')!
    render(
      <RoomScene
        game={createInitialGameState({ now: 1_000, seed: 'room-scene-fridge-layer' })}
        panel="fridge"
        area={fridge}
        walking={false}
        walkingDirection="right"
        sleeping={false}
        restDarkness={0}
        onArea={onArea}
        onPanel={vi.fn()}
        onBackgroundActivate={vi.fn()}
        onHelp={vi.fn()}
        onTaskEvent={onTaskEvent}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '打开冰箱' }))
    expect(onArea).toHaveBeenCalledWith(fridge)

    fireEvent.click(screen.getByRole('button', { name: '饼狗，打开行动菜单' }))
    expect(screen.getByRole('dialog', { name: '饼狗状态' })).toBeInTheDocument()
    expect(onTaskEvent).toHaveBeenCalledWith({ type: 'pet-menu-opened' })

    expect(gameV4Styles).toMatch(/\.room-card--v4 \.room-hotspot\s*\{\s*z-index:\s*9;\s*\}/u)
    expect(gameV4Styles).not.toMatch(
      /\.room-card--v4 \.room-mascot--actor\s*\{[^}]*pointer-events:\s*none/su,
    )
  })

  it('现实维度显示刷播、冲热、工作与唱片机四个设施入口', () => {
    const onArea = vi.fn()
    const game = {
      ...createInitialGameState({ now: 1_000, seed: 'room-scene-reality' }),
      world: 'reality' as const,
    }
    renderRoom({ game, onArea })

    fireEvent.click(screen.getByRole('button', { name: '刷播' }))
    expect(onArea).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'computer',
        panel: 'reality-stream',
        petCenter: { x: 504, y: 409 },
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '冲热（开发中）' }))
    expect(screen.getByRole('button', { name: '冲热（开发中）' })).toHaveStyle({
      '--x': '72%',
      '--y': '18%',
    })
    expect(onArea).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'trendComputer',
        panel: 'reality-trend',
        petCenter: { x: 504, y: 409 },
        petLocation: 'computer',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '工作' }))
    expect(onArea).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'workComputer',
        panel: 'reality-work',
        petCenter: { x: 420, y: 1172 },
        petLocation: 'work-computer',
      }),
    )

    expect(screen.getByRole('button', { name: '放张唱片' })).toBeInTheDocument()
    for (const hiddenLabel of [
      '去床上',
      '去电脑前',
      '看看衣架',
      '弹弹琴',
      '打开冰箱',
      '看看收藏墙',
      '去门口',
    ]) {
      expect(screen.queryByRole('button', { name: hiddenLabel })).not.toBeInTheDocument()
    }
  })

  it('游戏维度保留原设施、隐藏现实工作入口，饼狗菜单不再提供打招呼按钮', () => {
    renderRoom()

    expect(screen.queryByRole('button', { name: '工作' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刷播' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '冲热（开发中）' })).not.toBeInTheDocument()
    for (const visibleLabel of [
      '去床上',
      '去电脑前',
      '看看衣架',
      '弹弹琴',
      '打开冰箱',
      '放张唱片',
      '看看收藏墙',
      '去门口',
    ]) {
      expect(screen.getByRole('button', { name: visibleLabel })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: '饼狗，打开行动菜单' }))
    expect(screen.getByRole('dialog', { name: '饼狗状态' })).toBeInTheDocument()
    expect(screen.getByText('饼狗正看着你👀')).toBeInTheDocument()
    expect(screen.getByLabelText('饼狗活力状态')).toHaveTextContent(
      /低活力|中等活力|高活力|活力满满/u,
    )
    expect(document.querySelector('.pet-menu__wishes')).toBeNull()
    expect(screen.queryByRole('button', { name: '和饼狗打个招呼' })).not.toBeInTheDocument()
  })

  it('未结算活动中点击饼狗同时打开菜单并进入活动进度页', () => {
    const onPanel = vi.fn()
    const game = activeGame('music')
    renderRoom({
      game,
      area: ROOM_AREAS.find((area) => area.id === 'keyboard')!,
      onPanel,
    })

    const mascot = screen.getByRole('button', { name: /的饼狗$/u })
    expect(mascot).not.toHaveClass('is-wandering', 'is-wander-moving')
    fireEvent.click(mascot)

    expect(screen.getByRole('dialog', { name: '饼狗状态' })).toBeInTheDocument()
    expect(screen.getByLabelText('饼狗活力状态')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看这次活动' })).toBeInTheDocument()
    expect(onPanel).toHaveBeenCalledWith('activity')
  })

  it('旅行开始会主动收起饼狗菜单，结束后不会自动重现', async () => {
    const idleGame = createInitialGameState({ now: 1_000, seed: 'room-scene-travel-menu' })
    const { rerender } = renderRoom({ game: idleGame })

    fireEvent.click(screen.getByRole('button', { name: '饼狗，打开行动菜单' }))
    expect(screen.getByRole('dialog', { name: '饼狗状态' })).toBeInTheDocument()

    rerender(
      <RoomScene
        game={activeGame('travel')}
        panel={null}
        area={DEFAULT_ROOM_AREA}
        walking={false}
        walkingDirection="right"
        sleeping={false}
        restDarkness={0}
        onArea={vi.fn()}
        onPanel={vi.fn()}
        onBackgroundActivate={vi.fn()}
        onHelp={vi.fn()}
        onTaskEvent={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '饼狗，打开行动菜单' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '饼狗不在家，查看出门进度' })).toHaveTextContent(
      '饼狗不在家点击查看出门进度',
    )
    expect(screen.getByRole('button', { name: '取消当前活动' })).toBeInTheDocument()

    await act(
      () =>
        new Promise<void>((resolve) => {
          globalThis.requestAnimationFrame(() => resolve())
        }),
    )

    rerender(
      <RoomScene
        game={idleGame}
        panel={null}
        area={DEFAULT_ROOM_AREA}
        walking={false}
        walkingDirection="right"
        sleeping={false}
        restDarkness={0}
        onArea={vi.fn()}
        onPanel={vi.fn()}
        onBackgroundActivate={vi.fn()}
        onHelp={vi.fn()}
        onTaskEvent={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog', { name: '饼狗状态' })).not.toBeInTheDocument()
  })

  it('旅行占位是母版内可聚焦按钮，点击后打开活动进度', () => {
    const onPanel = vi.fn()
    renderRoom({ game: activeGame('travel'), panel: 'status', onPanel })

    const note = screen.getByRole('button', { name: '饼狗不在家，查看出门进度' })
    note.focus()
    expect(note).toHaveFocus()
    expect(note).toHaveClass('travel-note', 'travel-note--v2')
    fireEvent.click(note)
    expect(onPanel).toHaveBeenCalledWith('activity')
  })

  it('帮助按钮显示信息图标并保留介绍语义', () => {
    renderRoom()

    expect(screen.getByRole('button', { name: '查看房屋玩法说明' })).toHaveTextContent('ℹ️')
  })

  it('维度角落按钮只把切换请求交给上层，并遵守禁用状态', () => {
    const onToggleDimension = vi.fn()
    const { rerender } = renderRoom({ onToggleDimension })

    const toggle = screen.getByRole('button', { name: '切换到现实生活维度' })
    expect(toggle).toHaveTextContent('🔃')
    fireEvent.click(toggle)
    expect(onToggleDimension).toHaveBeenCalledOnce()

    rerender(
      <RoomScene
        game={createInitialGameState({ now: 1_000, seed: 'room-scene-disabled-dimension' })}
        panel={null}
        area={DEFAULT_ROOM_AREA}
        walking={false}
        walkingDirection="right"
        sleeping={false}
        restDarkness={0}
        onArea={vi.fn()}
        onPanel={vi.fn()}
        onBackgroundActivate={vi.fn()}
        onHelp={vi.fn()}
        dimensionToggleDisabled
        onToggleDimension={onToggleDimension}
        onTaskEvent={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '切换到现实生活维度' }))
    expect(onToggleDimension).toHaveBeenCalledOnce()
  })

  it('活动期间左下角只请求上层进入取消流程', () => {
    const onRequestCancelActivity = vi.fn()
    const onPanel = vi.fn()
    const { rerender } = renderRoom({
      game: activeGame('rest'),
      area: ROOM_AREAS.find((area) => area.id === 'bed')!,
      onPanel,
      onRequestCancelActivity,
    })

    const cancel = screen.getByRole('button', { name: '取消当前活动' })
    expect(cancel).toHaveTextContent('↩️')
    fireEvent.click(cancel)
    expect(onRequestCancelActivity).toHaveBeenCalledOnce()
    expect(onPanel).not.toHaveBeenCalled()

    rerender(
      <RoomScene
        game={createInitialGameState({ now: 1_000, seed: 'room-scene-idle' })}
        panel={null}
        area={DEFAULT_ROOM_AREA}
        walking={false}
        walkingDirection="right"
        sleeping={false}
        restDarkness={0}
        onArea={vi.fn()}
        onPanel={onPanel}
        onBackgroundActivate={vi.fn()}
        onRequestCancelActivity={onRequestCancelActivity}
        onHelp={vi.fn()}
        onTaskEvent={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: '取消当前活动' })).not.toBeInTheDocument()
  })

  it('苹果钟计时中也显示左下 ↩️，并只请求上层打开苹果钟取消确认', () => {
    const onRequestCancelPomodoro = vi.fn()
    const onRequestCancelActivity = vi.fn()
    const onPanel = vi.fn()
    renderRoom({
      pomodoroRunning: true,
      onRequestCancelPomodoro,
      onRequestCancelActivity,
      onPanel,
    })

    const cancel = screen.getByRole('button', { name: '取消当前苹果钟' })
    expect(cancel).toHaveTextContent('↩️')
    fireEvent.click(cancel)
    expect(onRequestCancelPomodoro).toHaveBeenCalledOnce()
    expect(onRequestCancelActivity).not.toHaveBeenCalled()
    expect(onPanel).not.toHaveBeenCalled()
  })
})
