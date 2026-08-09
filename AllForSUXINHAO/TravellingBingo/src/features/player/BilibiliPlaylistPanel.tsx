import { useBilibiliPlayerController } from './playerContext'
import type { BilibiliPlaybackMode } from './playerModel'

import './BilibiliPlaylistPanel.css'

interface BilibiliPlaylistPanelProps {
  trackListLabel?: string
  onTrackOpened?: (bvid: string) => void
}

const MODE_OPTIONS: readonly { value: BilibiliPlaybackMode; label: string }[] = [
  { value: 'list', label: '列表' },
  { value: 'single', label: '单曲' },
  { value: 'shuffle', label: '随机' },
]

export function BilibiliPlaylistPanel({
  trackListLabel = '全站第一曲目',
  onTrackOpened,
}: BilibiliPlaylistPanelProps) {
  const controller = useBilibiliPlayerController()

  function reportRequest(request: ReturnType<typeof controller.selectTrack>) {
    if (request) onTrackOpened?.(request.track.bvid)
  }

  return (
    <section className="bilibili-playlist-panel" aria-labelledby="bilibili-playlist-title">
      <header>
        <span className="paper-tag">唱片机</span>
        <h3 id="bilibili-playlist-title">八首全站第一</h3>
      </header>

      <div className="bilibili-playlist-panel__controls">
        <div className="bilibili-playlist-panel__modes" role="group" aria-label="切歌模式">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={controller.state.mode === option.value}
              onClick={() => controller.setMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={controller.state.tracks.length === 0}
          onClick={() => reportRequest(controller.previous())}
        >
          上一首
        </button>
        <button
          type="button"
          disabled={controller.state.tracks.length === 0}
          onClick={() => reportRequest(controller.next())}
        >
          下一首
        </button>
      </div>

      <div className="bilibili-playlist-panel__tracks">
        <h4>全站第一</h4>
        <ol aria-label={trackListLabel}>
          {controller.state.tracks.map((track) => (
            <li key={track.bvid}>
              <button
                type="button"
                aria-pressed={controller.state.selectedBvid === track.bvid}
                onClick={() => reportRequest(controller.selectTrack(track.bvid))}
              >
                <strong>{track.title}</strong>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
