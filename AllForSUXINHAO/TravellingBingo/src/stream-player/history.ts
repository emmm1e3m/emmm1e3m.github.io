import {
  parseStoredStreamHistory,
  STREAM_PLAYER_HISTORY_KEY,
} from '@/features/reality/stream/popupProtocol'

export {
  storeStreamSession,
  STREAM_PLAYER_HISTORY_KEY,
  type StoredStreamSession as StreamPlayerHistoryItem,
} from '@/features/reality/stream/popupProtocol'
export const STREAM_PLAYER_HISTORY_LIMIT = 10

export function readStreamPlayerHistory(storage?: Pick<Storage, 'getItem'>) {
  let target = storage
  if (target === undefined) {
    try {
      target = globalThis.localStorage
    } catch {
      return []
    }
  }

  try {
    return parseStoredStreamHistory(target.getItem(STREAM_PLAYER_HISTORY_KEY))
  } catch {
    return []
  }
}
