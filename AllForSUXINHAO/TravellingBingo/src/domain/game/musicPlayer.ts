import { BILIBILI_BVID_PATTERN } from './constants'
import type { GameAction, GameError, GameState, GameTransition } from './types'

export type MusicPlayerAction = Extract<GameAction, { type: `music/${string}` }>

function fail(state: GameState, code: GameError['code'], message: string): GameTransition {
  return { ok: false, state, error: { code, message }, effects: [] }
}

function succeed(
  state: GameState,
  change: Extract<import('./types').GameEffect, { type: 'music-player-updated' }>['change'],
  bvid?: string,
): GameTransition {
  return {
    ok: true,
    state,
    effects: [{ type: 'music-player-updated', change, ...(bvid ? { bvid } : {}) }],
  }
}

export function isMusicPlayerAction(action: GameAction): action is MusicPlayerAction {
  return action.type.startsWith('music/')
}

/** 唯一内置曲库只持久保存选曲位置与循环模式。 */
export function reduceMusicPlayer(state: GameState, action: MusicPlayerAction): GameTransition {
  switch (action.type) {
    case 'music/track-select': {
      if (
        !BILIBILI_BVID_PATTERN.test(action.bvid) ||
        !Number.isSafeInteger(action.index) ||
        action.index < 0
      ) {
        return fail(state, 'INVALID_BVID', '曲目 BV 或索引无效')
      }
      return succeed(
        {
          ...state,
          musicPlayer: {
            ...state.musicPlayer,
            currentBvid: action.bvid,
            currentIndex: action.index,
          },
        },
        'track-selected',
        action.bvid,
      )
    }
    case 'music/loop-set':
      return succeed(
        { ...state, musicPlayer: { ...state.musicPlayer, loopMode: action.loopMode } },
        'loop-set',
      )
  }
}
