import { useEffect, useRef } from 'react'

import {
  bilibiliPlayerRequestIdentity,
  buildBilibiliPlayerUrl,
  normalizeStartAtSeconds,
  useOptionalBilibiliPlayerController,
  type BilibiliPlayerRequestOrigin,
  type BilibiliPlayerTrack,
} from '@/features/player'

import './BilibiliPlayer.css'

interface BilibiliPlayerProps {
  video: BilibiliPlayerTrack
  compact?: boolean
  startAtSeconds?: number
  origin?: BilibiliPlayerRequestOrigin
  onOpened?: (bvid: string) => void
}

function numericDate(iso: string) {
  const date = new Date(iso)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function VideoByline({
  video,
  includeBvid = false,
}: {
  video: BilibiliPlayerTrack
  includeBvid?: boolean
}) {
  const hasMetadata = Boolean(video.authorName || video.publishedAt)
  return (
    <small>
      {video.authorName && <>{video.authorName} · </>}
      {video.publishedAt && (
        <>
          <span className="numeric-copy">{numericDate(video.publishedAt)}</span>
          {includeBvid && ' · '}
        </>
      )}
      {(includeBvid || !hasMetadata) && <span className="numeric-copy">{video.bvid}</span>}
    </small>
  )
}

/**
 * 收藏详情挂载即发出自动播放请求。共享 Provider 存在时，唯一 iframe 留在持久 dock 中。
 */
export function BilibiliPlayer({
  video,
  compact = false,
  startAtSeconds = 0,
  origin = { kind: 'direct' },
  onOpened,
}: BilibiliPlayerProps) {
  const sharedController = useOptionalBilibiliPlayerController()
  const normalizedStart = normalizeStartAtSeconds(startAtSeconds)
  const requestIdentity = bilibiliPlayerRequestIdentity(video.bvid, origin)
  const reportedIdentityRef = useRef<string | null>(null)

  useEffect(() => {
    if (reportedIdentityRef.current === requestIdentity) return

    if (sharedController) {
      const activeRequest = sharedController.state.activeRequest
      if (
        activeRequest &&
        bilibiliPlayerRequestIdentity(activeRequest.track.bvid, activeRequest.origin) ===
          requestIdentity
      ) {
        reportedIdentityRef.current = requestIdentity
        sharedController.showDock()
        return
      }
    }

    reportedIdentityRef.current = requestIdentity
    if (sharedController) {
      sharedController.requestTrack(video, {
        startAtSeconds: normalizedStart,
        origin,
      })
    }
    onOpened?.(video.bvid)
  }, [normalizedStart, onOpened, origin, requestIdentity, sharedController, video])

  if (sharedController) {
    return (
      <section
        className={`bilibili-player-shared ${compact ? 'is-compact' : ''}`}
        aria-label={video.title}
      >
        <p>
          <strong>{video.title}</strong>
          <VideoByline video={video} includeBvid />
        </p>
        <span className="bilibili-player-shared__status" role="status">
          已请求自动播放；关闭详情后，播放器仍会留在页面下方。
        </span>
        <a href={video.sourceUrl} target="_blank" rel="noopener noreferrer">
          在来源页打开
        </a>
      </section>
    )
  }

  const playerUrl = buildBilibiliPlayerUrl({
    bvid: video.bvid,
    startAtSeconds: normalizedStart,
  })

  return (
    <section className={`bilibili-player ${compact ? 'is-compact' : ''}`} aria-label={video.title}>
      <div className="bilibili-player__heading">
        <p>
          <strong>{video.title}</strong>
          <VideoByline video={video} includeBvid />
        </p>
        <span role="status">已请求自动播放</span>
      </div>
      <div className="bilibili-player__frame">
        <iframe
          src={playerUrl}
          title={`${video.title}播放器`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <a
        className="bilibili-player__source"
        href={video.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        在来源页打开
      </a>
    </section>
  )
}
