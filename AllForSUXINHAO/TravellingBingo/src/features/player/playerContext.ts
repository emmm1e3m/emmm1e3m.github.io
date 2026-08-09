import { createContext, useContext } from 'react'

import type { BilibiliPlayerController } from './playerController'

export const BilibiliPlayerContext = createContext<BilibiliPlayerController | null>(null)

function useOptionalBilibiliPlayerController() {
  return useContext(BilibiliPlayerContext)
}

export function useBilibiliPlayerController() {
  const controller = useOptionalBilibiliPlayerController()
  if (!controller) {
    throw new Error('播放器控制器必须在 BilibiliPlayerProvider 内使用')
  }
  return controller
}
