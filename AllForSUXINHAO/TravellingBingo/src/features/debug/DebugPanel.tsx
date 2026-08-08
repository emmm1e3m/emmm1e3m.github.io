import { useState } from 'react'

import type { GameAction, GameState, ProbabilityKey } from '@/domain'

const PROBABILITY_COPY: Record<ProbabilityKey, string> = {
  postcard: '明信片',
  millionShot: '百万直拍',
  siteFirst: '全站第一',
  friend: '遇见朋友',
}

const DURATION_CHOICES = [
  { value: 10_000, label: '10 秒' },
  { value: 30_000, label: '30 秒' },
  { value: 112_000, label: '112 秒' },
] as const

interface DebugPanelProps {
  game: GameState
  onAction: (action: GameAction) => void
  onBackup: () => void
}

export function DebugPanel({ game, onAction, onBackup }: DebugPanelProps) {
  const [confirmCollectAll, setConfirmCollectAll] = useState(false)
  const duration = game.gameBalance.activityDurationMs
  const probabilities = game.gameBalance.probabilities

  function setDuration(value: number) {
    onAction({ type: 'debug/duration-set', durationMs: value })
  }

  function setProbability(key: ProbabilityKey, value: number) {
    onAction({ type: 'debug/probability-set', key, value })
  }

  return (
    <div className="context-content debug-panel">
      <span className="paper-tag paper-tag--debug">DEBUG 门牌</span>
      <h2>调试房间规则</h2>
      <p className="panel-intro">这里的设置会跟着调试存档一起保存。</p>

      <fieldset className="debug-choice-group">
        <legend>下一次活动时长</legend>
        <div>
          {DURATION_CHOICES.map((choice) => (
            <button
              key={choice.value}
              type="button"
              aria-pressed={duration === choice.value}
              onClick={() => setDuration(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="probability-editor">
        <legend>下一次活动的概率</legend>
        {(Object.keys(PROBABILITY_COPY) as ProbabilityKey[]).map((key) => {
          const value = probabilities[key]
          return (
            <div className="probability-row" key={key}>
              <span>
                <label htmlFor={`probability-${key}`}>{PROBABILITY_COPY[key]}</label>
                <output>{Math.round(value * 100)}%</output>
              </span>
              <input
                id={`probability-${key}`}
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(value * 100)}
                onChange={(event) => setProbability(key, Number(event.target.value) / 100)}
              />
              <span className="probability-number">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  aria-label={`${PROBABILITY_COPY[key]}百分比`}
                  value={Math.round(value * 100)}
                  onChange={(event) => {
                    const nextValue = Math.min(100, Math.max(0, Number(event.target.value)))
                    setProbability(key, nextValue / 100)
                  }}
                />
                <span aria-hidden="true">%</span>
              </span>
            </div>
          )
        })}
      </fieldset>

      <div className="debug-actions">
        <button type="button" onClick={() => onAction({ type: 'debug/apples-adjust', delta: 20 })}>
          增加 20 个苹果
        </button>
        <button
          type="button"
          disabled={!game.activeActivity}
          onClick={() => onAction({ type: 'debug/activity-complete', now: Date.now() })}
        >
          立即完成活动
        </button>
        {!confirmCollectAll ? (
          <button type="button" onClick={() => setConfirmCollectAll(true)}>
            一键全收集
          </button>
        ) : (
          <div className="debug-confirm" role="group" aria-label="确认一键全收集">
            <strong>确认把全部收藏加入调试档？</strong>
            <button
              type="button"
              onClick={() => {
                onAction({ type: 'debug/collect-all', now: Date.now() })
                setConfirmCollectAll(false)
              }}
            >
              确认全收集
            </button>
            <button type="button" onClick={() => setConfirmCollectAll(false)}>
              取消
            </button>
          </div>
        )}
        <button type="button" onClick={() => onAction({ type: 'debug/tuning-reset' })}>
          恢复默认规则
        </button>
        <button type="button" onClick={onBackup}>
          导出调试备份
        </button>
      </div>
    </div>
  )
}
