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

export function readStreamPlayerHistory(storage: Pick<Storage, 'getItem'> = localStorage) {
  return parseStoredStreamHistory(storage.getItem(STREAM_PLAYER_HISTORY_KEY))
}
