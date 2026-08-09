import { useEffect, useRef } from 'react'

import {
  bilibiliPlayerRequestIdentity,
  useBilibiliPlayerController,
  type BilibiliPlayerRequestOrigin,
  type BilibiliPlayerTrack,
} from '@/features/player'

interface BilibiliPlayerProps {
  video: BilibiliPlayerTrack
  origin?: BilibiliPlayerRequestOrigin
  onOpened?: (bvid: string) => void
}

/** 收藏详情只保留与标签同层级的视频标题；播放画面统一由 Dock 承载。 */
export function BilibiliPlayer({
  video,
  origin = { kind: 'direct' },
  onOpened,
}: BilibiliPlayerProps) {
  const controller = useBilibiliPlayerController()
  const requestIdentity = bilibiliPlayerRequestIdentity(video.bvid, origin)
  const reportedIdentityRef = useRef<string | null>(null)

  useEffect(() => {
    if (reportedIdentityRef.current === requestIdentity) return
    reportedIdentityRef.current = requestIdentity
    // 收藏详情每次重新打开都代表一次新点播；不得复用上次暂停留下的运行时进度。
    controller.requestTrack(video, { origin })
    onOpened?.(video.bvid)
  }, [controller, onOpened, origin, requestIdentity, video])

  return <p className="bilibili-player-summary">{video.title}</p>
}
