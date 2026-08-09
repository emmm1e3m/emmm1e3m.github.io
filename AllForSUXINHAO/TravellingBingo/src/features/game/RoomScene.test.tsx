import { act, fireEvent, render, screen } from '@testing-library/react'

import { createInitialGameState, type GameState } from '@/domain'

import gameV4Styles from './game-v4.css?raw'
import { RoomScene } from './RoomScene'
import { DEFAULT_ROOM_AREA, ROOM_AREAS, ROOM_CANVAS, type RoomArea } from './roomConfig'

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
  onReluctantArea,
  onPanel = vi.fn(),
  onBackgroundActivate = vi.fn(),
  onRequestCancelActivity,
  pomodoroRunning,
  onRequestCancelPomodoro,
}: {
  game?: GameState
  area?: RoomArea
  panel?: Parameters<typeof RoomScene>[0]['panel']
  onArea?: Parameters<typeof RoomScene>[0]['onArea']
  onReluctantArea?: Parameters<typeof RoomScene>[0]['onReluctantArea']
  onPanel?: Parameters<typeof RoomScene>[0]['onPanel']
  onBackgroundActivate?: Parameters<typeof RoomScene>[0]['onBackgroundActivate']
  onRequestCancelActivity?: Parameters<typeof RoomScene>[0]['onRequestCancelActivity']
  pomodoroRunning?: Parameters<typeof RoomScene>[0]['pomodoroRunning']
  onRequestCancelPomodoro?: Parameters<typeof RoomScene>[0]['onRequestCancelPomodoro']
} = {}) {
  return render(
    <RoomScene
      game={game}
      panel={panel}
      area={area}
      walking={false}
      sleeping={false}
      restDarkness={0}
      onArea={onArea}
      onReluctantArea={onReluctantArea}
      onPanel={onPanel}
      onBackgroundActivate={onBackgroundActivate}
      onRequestCancelActivity={onRequestCancelActivity}
      pomodoroRunning={pomodoroRunning}
      onRequestCancelPomodoro={onRequestCancelPomodoro}
      onHelp={vi.fn()}
      onTaskEvent={vi.fn()}
    />,
  )
}

describe('房屋场景定位与返回交互', () => {
  it.each([DEFAULT_ROOM_AREA, ...ROOM_AREAS])('$label 的饼狗中心由母版像素严格换算', (area) => {
    renderRoom({ area })

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
    fireEvent.click(screen.getByRole('button', { name: '数据' }))
    expect(onReluctantArea).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '数据' })).not.toHaveClass('is-reluctant')
  })

  it('冰箱落点重叠时设施热点优先可点，饼狗其余区域仍能打开菜单', () => {
    const onArea = vi.fn()
    const onTaskEvent = vi.fn()
    const fridge = ROOM_AREAS.find((area) => area.id === 'fridge')!
    render(
      <RoomScene
        game={createInitialGameState({ now: 1_000, seed: 'room-scene-fridge-layer' })}
        panel={null}
        area={fridge}
        walking={false}
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
    expect(screen.getByRole('dialog', { name: '饼狗想做什么' })).toBeInTheDocument()
    expect(onTaskEvent).toHaveBeenCalledWith({ type: 'pet-menu-opened' })

    expect(gameV4Styles).toMatch(/\.room-card--v4 \.room-hotspot\s*\{\s*z-index:\s*9;\s*\}/u)
    expect(gameV4Styles).not.toMatch(
      /\.room-card--v4 \.room-mascot--actor\s*\{[^}]*pointer-events:\s*none/su,
    )
  })

  it('现实维度只显示数据、工作与唱片机三个设施入口', () => {
    const onArea = vi.fn()
    const game = {
      ...createInitialGameState({ now: 1_000, seed: 'room-scene-reality' }),
      world: 'reality' as const,
    }
    renderRoom({ game, onArea })

    fireEvent.click(screen.getByRole('button', { name: '数据' }))
    expect(onArea).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'computer',
        panel: 'reality-data',
        petCenter: { x: 504, y: 409 },
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
      '去床边',
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
    expect(screen.queryByRole('button', { name: '数据' })).not.toBeInTheDocument()
    for (const visibleLabel of [
      '去床边',
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
    expect(screen.getByRole('dialog', { name: '饼狗想做什么' })).toBeInTheDocument()
    expect(screen.getByLabelText('饼狗今天的想法')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '和饼狗打个招呼' })).not.toBeInTheDocument()
  })

  it('旅行开始会主动收起饼狗菜单，结束后不会自动重现', async () => {
    const idleGame = createInitialGameState({ now: 1_000, seed: 'room-scene-travel-menu' })
    const { rerender } = renderRoom({ game: idleGame })

    fireEvent.click(screen.getByRole('button', { name: '饼狗，打开行动菜单' }))
    expect(screen.getByRole('dialog', { name: '饼狗想做什么' })).toBeInTheDocument()

    rerender(
      <RoomScene
        game={activeGame('travel')}
        panel={null}
        area={DEFAULT_ROOM_AREA}
        walking={false}
        sleeping={false}
        restDarkness={0}
        onArea={vi.fn()}
        onPanel={vi.fn()}
        onBackgroundActivate={vi.fn()}
        onHelp={vi.fn()}
        onTaskEvent={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /饼狗/u })).not.toBeInTheDocument()
    expect(screen.queryByText('饼狗出门啦')).not.toBeInTheDocument()
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
        sleeping={false}
        restDarkness={0}
        onArea={vi.fn()}
        onPanel={vi.fn()}
        onBackgroundActivate={vi.fn()}
        onHelp={vi.fn()}
        onTaskEvent={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog', { name: '饼狗想做什么' })).not.toBeInTheDocument()
  })

  it('帮助按钮显示信息图标并保留介绍语义', () => {
    renderRoom()

    expect(screen.getByRole('button', { name: '查看房屋玩法说明' })).toHaveTextContent('ℹ️')
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
