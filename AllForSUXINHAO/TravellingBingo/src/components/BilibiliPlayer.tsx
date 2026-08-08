import { useState } from 'react'

import type { BilibiliVideo } from '@/content'

import './BilibiliPlayer.css'

interface BilibiliPlayerProps {
  video: BilibiliVideo
  compact?: boolean
  onOpened?: (bvid: string) => void
}

function numericDate(iso: string) {
  const date = new Date(iso)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Bilibili 跨域播放器。父页面只能确认用户主动打开了播放器，不能伪称视频已经开始或结束播放。
 */
export function BilibiliPlayer({ video, compact = false, onOpened }: BilibiliPlayerProps) {
  const [open, setOpen] = useState(false)
  const playerUrl = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(video.bvid)}&p=1&autoplay=0&danmaku=0`

  function openPlayer() {
    onOpened?.(video.bvid)
    setOpen(true)
  }

  function closePlayer() {
    setOpen(false)
  }

  if (!open) {
    return (
      <div className={`bilibili-player-trigger ${compact ? 'is-compact' : ''}`}>
        <p>
          <strong>{video.title}</strong>
          <small>
            {video.authorName} ·{' '}
            <span className="numeric-copy">{numericDate(video.publishedAt)}</span>
          </small>
        </p>
        <button type="button" onClick={openPlayer}>
          打开播放器
        </button>
        <a href={video.sourceUrl} target="_blank" rel="noopener noreferrer">
          在来源页打开
        </a>
      </div>
    )
  }

  return (
    <section className={`bilibili-player ${compact ? 'is-compact' : ''}`} aria-label={video.title}>
      <div className="bilibili-player__heading">
        <p>
          <strong>{video.title}</strong>
          <small>
            {video.authorName} ·{' '}
            <span className="numeric-copy">{numericDate(video.publishedAt)}</span> ·{' '}
            <span className="numeric-copy">{video.bvid}</span>
          </small>
        </p>
        <button type="button" onClick={closePlayer}>
          收起播放器
        </button>
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
