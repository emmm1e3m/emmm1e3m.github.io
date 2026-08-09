import { type FormEvent, useId, useState } from 'react'

import { useBilibiliPlayerController } from './playerContext'
import {
  createNamedBilibiliPlaylist,
  parseBilibiliPlaylistInput,
  PLAYLIST_NAME_MAX_LENGTH,
  type BilibiliPlaybackMode,
  type BilibiliPlayerTrack,
  type ParsedBilibiliPlaylistInput,
} from './playerModel'

import './BilibiliPlaylistPanel.css'

interface BilibiliPlaylistPanelProps {
  initialName?: string
  initialInput?: string
  resolveTrack?: (bvid: string) => BilibiliPlayerTrack | undefined
  onPlaylistLoaded?: (name: string, bvids: readonly string[]) => void
  trackListLabel?: string
  onTrackOpened?: (bvid: string) => void
  submitLabel?: string
}

interface ImportFeedback {
  readonly tone: 'success' | 'error'
  readonly message: string
  readonly result?: ParsedBilibiliPlaylistInput
}

const MODE_OPTIONS: readonly { value: BilibiliPlaybackMode; label: string }[] = [
  { value: 'list', label: '列表' },
  { value: 'single', label: '单曲' },
  { value: 'shuffle', label: '随机' },
]

export function BilibiliPlaylistPanel({
  initialName = '我的播放列表',
  initialInput = '',
  resolveTrack,
  onPlaylistLoaded,
  trackListLabel,
  onTrackOpened,
  submitLabel = '载入这个列表',
}: BilibiliPlaylistPanelProps) {
  const controller = useBilibiliPlayerController()
  const nameId = useId()
  const inputId = useId()
  const [name, setName] = useState(initialName)
  const [input, setInput] = useState(initialInput)
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null)

  function reportRequest(request: ReturnType<typeof controller.selectTrack>) {
    if (request) onTrackOpened?.(request.track.bvid)
  }

  function loadPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = parseBilibiliPlaylistInput(input)
    if (result.entries.length === 0) {
      setFeedback({
        tone: 'error',
        message: '没有找到可以加入播放列表的 BV 号。',
        result,
      })
      return
    }

    try {
      const tracks = result.entries.map(({ track }) => resolveTrack?.(track.bvid) ?? track)
      const playlist = createNamedBilibiliPlaylist(name, tracks)
      reportRequest(controller.loadPlaylist(playlist))
      onPlaylistLoaded?.(
        playlist.name,
        playlist.tracks.map((track) => track.bvid),
      )
      setFeedback({
        tone: 'success',
        message: `已载入 ${playlist.tracks.length} 首；去重 ${result.duplicates.length} 行；跳过 ${result.rejected.length} 行。`,
        result,
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : '播放列表没有载入。',
        result,
      })
    }
  }

  const activeBvid = controller.state.selectedBvid

  return (
    <section className="bilibili-playlist-panel" aria-labelledby="bilibili-playlist-title">
      <header>
        <span className="paper-tag">唱片机</span>
        <h3 id="bilibili-playlist-title">整理播放列表</h3>
        <p>每行放一个 BV 号或完整 Bilibili 视频链接，重复曲目只保留第一次出现的位置。</p>
      </header>

      <form className="bilibili-playlist-panel__editor" onSubmit={loadPlaylist}>
        <label htmlFor={nameId}>播放列表名称</label>
        <input
          id={nameId}
          value={name}
          maxLength={PLAYLIST_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <label htmlFor={inputId}>BV 号或视频链接</label>
        <textarea
          id={inputId}
          value={input}
          rows={5}
          spellCheck={false}
          placeholder={'BV1xx411c7mD\nhttps://www.bilibili.com/video/BV1B7411m7LV'}
          onChange={(event) => setInput(event.currentTarget.value)}
        />
        <button type="submit">{submitLabel}</button>
      </form>

      {feedback && (
        <div
          className={`bilibili-playlist-panel__feedback is-${feedback.tone}`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          <strong>{feedback.message}</strong>
          {feedback.result && feedback.result.rejected.length > 0 && (
            <ul aria-label="未载入的行">
              {feedback.result.rejected.map((issue) => (
                <li key={`${issue.lineNumber}-${issue.input}`}>
                  第 <span className="numeric-copy">{issue.lineNumber}</span> 行：{issue.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
          disabled={controller.state.playlist.tracks.length === 0}
          onClick={() => reportRequest(controller.previous())}
        >
          上一首
        </button>
        <button
          type="button"
          disabled={controller.state.playlist.tracks.length === 0}
          onClick={() => reportRequest(controller.next())}
        >
          下一首
        </button>
      </div>

      <div className="bilibili-playlist-panel__tracks">
        <h4>{controller.state.playlist.name}</h4>
        {controller.state.playlist.tracks.length === 0 ? (
          <p role="status">列表还是空的。</p>
        ) : (
          <ol aria-label={trackListLabel ?? `${controller.state.playlist.name}曲目`}>
            {controller.state.playlist.tracks.map((track) => (
              <li key={track.bvid}>
                <button
                  type="button"
                  aria-pressed={activeBvid === track.bvid}
                  onClick={() =>
                    reportRequest(
                      controller.selectTrack(track.bvid, {
                        origin: {
                          kind: 'playlist',
                          playlistName: controller.state.playlist.name,
                        },
                      }),
                    )
                  }
                >
                  <strong>{track.title}</strong>
                  {track.title !== track.bvid && <span className="numeric-copy">{track.bvid}</span>}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
