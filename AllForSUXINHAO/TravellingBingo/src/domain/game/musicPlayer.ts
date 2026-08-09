import {
  BILIBILI_BVID_PATTERN,
  MAX_PLAYLIST_ID_LENGTH,
  MAX_PLAYLIST_NAME_LENGTH,
  MAX_PLAYLISTS,
  MAX_PLAYLIST_TRACKS,
} from './constants'
import { isValidTimestamp } from './time'
import type { GameAction, GameError, GameState, GameTransition } from './types'

export type MusicPlayerAction = Extract<GameAction, { type: `music/${string}` }>

function fail(state: GameState, code: GameError['code'], message: string): GameTransition {
  return { ok: false, state, error: { code, message }, effects: [] }
}

function succeed(
  state: GameState,
  action: MusicPlayerAction,
  change: Extract<import('./types').GameEffect, { type: 'music-player-updated' }>['change'],
  details: { playlistId?: string | null; bvid?: string | null } = {},
): GameTransition {
  return {
    ok: true,
    state,
    effects: [{ type: 'music-player-updated', change, ...details }],
  }
}

function validIdentifier(id: string): boolean {
  return id.length > 0 && id.length <= MAX_PLAYLIST_ID_LENGTH && id.trim() === id
}

function validName(name: string): boolean {
  const length = [...name].length
  return name.trim() === name && length > 0 && length <= MAX_PLAYLIST_NAME_LENGTH
}

function validBvids(bvids: readonly string[]): boolean {
  return (
    bvids.length <= MAX_PLAYLIST_TRACKS &&
    bvids.every((bvid) => BILIBILI_BVID_PATTERN.test(bvid)) &&
    new Set(bvids).size === bvids.length
  )
}

export function isMusicPlayerAction(action: GameAction): action is MusicPlayerAction {
  return action.type.startsWith('music/')
}

/** 用户播放列表的唯一纯领域入口；内置列表内容由 UI/content 提供。 */
export function reduceMusicPlayer(state: GameState, action: MusicPlayerAction): GameTransition {
  const player = state.musicPlayer
  switch (action.type) {
    case 'music/playlist-create': {
      if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '创建时间无效')
      if (!validIdentifier(action.playlistId)) {
        return fail(state, 'INVALID_AMOUNT', '播放列表 ID 无效')
      }
      if (!validName(action.name)) return fail(state, 'INVALID_AMOUNT', '播放列表名称无效')
      const bvids = action.bvids ?? []
      if (!validBvids(bvids)) return fail(state, 'INVALID_BVID', '播放列表中的 BV 无效或重复')
      if (player.playlists[action.playlistId] !== undefined) {
        return fail(state, 'DUPLICATE_ID', '播放列表 ID 已存在')
      }
      if (player.order.length >= MAX_PLAYLISTS) {
        return fail(state, 'PLAYLIST_LIMIT_REACHED', '播放列表数量已达到上限')
      }
      const playlist = {
        id: action.playlistId,
        name: action.name,
        bvids: [...bvids],
        createdAt: action.now,
        updatedAt: action.now,
      }
      return succeed(
        {
          ...state,
          musicPlayer: {
            ...player,
            playlists: { ...player.playlists, [playlist.id]: playlist },
            order: [...player.order, playlist.id],
          },
        },
        action,
        'playlist-created',
        { playlistId: playlist.id },
      )
    }
    case 'music/playlist-update': {
      if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '更新时间无效')
      const previous = player.playlists[action.playlistId]
      if (previous === undefined) return fail(state, 'PLAYLIST_NOT_FOUND', '播放列表不存在')
      if (action.now < previous.updatedAt) return fail(state, 'INVALID_TIME', '更新时间不能倒退')
      const name = action.name ?? previous.name
      const bvids = action.bvids ?? previous.bvids
      if (!validName(name)) return fail(state, 'INVALID_AMOUNT', '播放列表名称无效')
      if (!validBvids(bvids)) return fail(state, 'INVALID_BVID', '播放列表中的 BV 无效或重复')
      const updated = { ...previous, name, bvids: [...bvids], updatedAt: action.now }
      const isActive = player.activePlaylistId === updated.id
      const selectedIndex = isActive ? updated.bvids.indexOf(player.currentBvid ?? '') : -1
      return succeed(
        {
          ...state,
          musicPlayer: {
            ...player,
            playlists: { ...player.playlists, [updated.id]: updated },
            currentBvid: isActive
              ? selectedIndex >= 0
                ? player.currentBvid
                : (updated.bvids[0] ?? null)
              : player.currentBvid,
            currentIndex: isActive ? (selectedIndex >= 0 ? selectedIndex : 0) : player.currentIndex,
            startAtSeconds: player.startAtSeconds,
          },
        },
        action,
        'playlist-updated',
        { playlistId: updated.id },
      )
    }
    case 'music/playlist-delete': {
      if (!isValidTimestamp(action.now)) return fail(state, 'INVALID_TIME', '删除时间无效')
      const previous = player.playlists[action.playlistId]
      if (previous === undefined) {
        return fail(state, 'PLAYLIST_NOT_FOUND', '播放列表不存在')
      }
      if (action.now < previous.updatedAt) {
        return fail(state, 'INVALID_TIME', '删除时间不能早于上次修改时间')
      }
      const playlists = { ...player.playlists }
      delete playlists[action.playlistId]
      const wasActive = player.activePlaylistId === action.playlistId
      return succeed(
        {
          ...state,
          musicPlayer: {
            ...player,
            playlists,
            order: player.order.filter((id) => id !== action.playlistId),
            activePlaylistId: wasActive ? null : player.activePlaylistId,
            currentBvid: wasActive ? null : player.currentBvid,
            currentIndex: wasActive ? 0 : player.currentIndex,
            startAtSeconds: player.startAtSeconds,
          },
        },
        action,
        'playlist-deleted',
        { playlistId: action.playlistId },
      )
    }
    case 'music/playlist-select': {
      if (action.playlistId !== null && player.playlists[action.playlistId] === undefined) {
        return fail(state, 'PLAYLIST_NOT_FOUND', '播放列表不存在')
      }
      const selected = action.playlistId === null ? null : player.playlists[action.playlistId]
      return succeed(
        {
          ...state,
          musicPlayer: {
            ...player,
            activePlaylistId: action.playlistId,
            currentBvid: selected?.bvids[0] ?? null,
            currentIndex: 0,
            startAtSeconds: player.startAtSeconds,
          },
        },
        action,
        'playlist-selected',
        { playlistId: action.playlistId },
      )
    }
    case 'music/track-select': {
      if (
        !BILIBILI_BVID_PATTERN.test(action.bvid) ||
        !Number.isSafeInteger(action.index) ||
        action.index < 0
      ) {
        return fail(state, 'INVALID_BVID', '曲目 BV 或索引无效')
      }
      const active =
        player.activePlaylistId === null ? null : player.playlists[player.activePlaylistId]
      if (active !== null && active.bvids[action.index] !== action.bvid) {
        return fail(state, 'INVALID_BVID', '曲目不在当前播放列表的对应位置')
      }
      return succeed(
        {
          ...state,
          musicPlayer: {
            ...player,
            currentBvid: action.bvid,
            currentIndex: action.index,
            startAtSeconds: player.startAtSeconds,
          },
        },
        action,
        'track-selected',
        { bvid: action.bvid, playlistId: player.activePlaylistId },
      )
    }
    case 'music/seek-set': {
      if (!Number.isSafeInteger(action.startAtSeconds) || action.startAtSeconds < 0) {
        return fail(state, 'INVALID_AMOUNT', '播放起点必须是非负整数秒')
      }
      return succeed(
        { ...state, musicPlayer: { ...player, startAtSeconds: action.startAtSeconds } },
        action,
        'seek-set',
      )
    }
    case 'music/loop-set':
      return succeed(
        { ...state, musicPlayer: { ...player, loopMode: action.loopMode } },
        action,
        'loop-set',
      )
    case 'music/autoplay-set':
      return succeed(
        { ...state, musicPlayer: { ...player, autoplay: true } },
        action,
        'autoplay-set',
      )
  }
}
