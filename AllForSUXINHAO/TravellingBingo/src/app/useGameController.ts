import { useCallback, useRef, useState } from 'react'

import {
  reduceGame,
  type CollectionCatalog,
  type GameAction,
  type GameState,
  type GameTransition,
} from '@/domain'

interface GameController {
  game: GameState | null
  replaceGame: (nextGame: GameState | null) => void
  applyAction: (action: GameAction, catalog: CollectionCatalog) => GameTransition | null
  getSnapshot: () => GameControllerSnapshot
}

export interface GameControllerSnapshot {
  game: GameState | null
  revision: number
}

/**
 * 让同一帧内的连续命令始终基于上一条命令刚产生的状态归约。
 *
 * React 的渲染状态仍负责刷新界面；同步引用只承担命令串行化，不在状态
 * updater 中执行 toast、弹窗等副作用，因此也不会受并发渲染重放影响。
 */
export function useGameController(): GameController {
  const [game, setRenderedGame] = useState<GameState | null>(null)
  const latestGame = useRef<GameState | null>(null)
  const latestRevision = useRef(0)

  const replaceGame = useCallback((nextGame: GameState | null) => {
    latestGame.current = nextGame
    latestRevision.current += 1
    setRenderedGame(nextGame)
  }, [])

  const applyAction = useCallback(
    (action: GameAction, catalog: CollectionCatalog): GameTransition | null => {
      const currentGame = latestGame.current
      if (!currentGame) return null

      const transition = reduceGame(currentGame, action, catalog)
      if (transition.ok) {
        latestGame.current = transition.state
        latestRevision.current += 1
        setRenderedGame(transition.state)
      }
      return transition
    },
    [],
  )

  const getSnapshot = useCallback(
    (): GameControllerSnapshot => ({
      game: latestGame.current,
      revision: latestRevision.current,
    }),
    [],
  )

  return { game, replaceGame, applyAction, getSnapshot }
}
