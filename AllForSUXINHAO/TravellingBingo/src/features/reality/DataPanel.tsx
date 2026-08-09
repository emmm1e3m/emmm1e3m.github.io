import { useId } from 'react'

import type { DataPanelProps, RealityDataSnapshot } from './types'
import './reality.css'

const DEFAULT_GROUP_URL = 'https://www.weibo.com/u/7878664767'

interface DataCardProps {
  title: string
  badge: string
  placeholder: string
  snapshot?: RealityDataSnapshot | null
}

function DataCard({ title, badge, placeholder, snapshot }: DataCardProps) {
  return (
    <article className="reality-data-card">
      <div className="reality-data-card__heading">
        <div>
          <span>{badge}</span>
          <h3>{title}</h3>
        </div>
        <span className="reality-placeholder-tag">{snapshot ? '当前状态' : '玩法说明'}</span>
      </div>
      {snapshot && (
        <>
          <strong className="reality-data-card__status">{snapshot.statusLabel}</strong>
          <p>{snapshot.detail}</p>
        </>
      )}
      <p className="reality-data-card__summary">{placeholder}</p>
      <div className="reality-data-card__method">
        <strong>使用方法</strong>
        <p>具体步骤很快会补到这里。</p>
      </div>
    </article>
  )
}

export function DataPanel({
  stream,
  trend,
  groupUrl = DEFAULT_GROUP_URL,
  onGroupLinkClick,
  className = '',
}: DataPanelProps) {
  const headingId = useId()

  return (
    <section
      className={`reality-panel reality-data-panel ${className}`.trim()}
      aria-labelledby={headingId}
    >
      <div className="reality-panel__heading">
        <div>
          <span className="reality-eyebrow">二楼电脑 · 数据</span>
          <h2 id={headingId}>刷播与冲热</h2>
        </div>
        <span className="reality-panel__mark" aria-hidden="true">
          ↗
        </span>
      </div>
      <p className="reality-panel__intro">
        电脑上放着两张行动卡，选一项想做的事，和饼狗一起为喜欢的人认真努力吧。
      </p>

      <div className="reality-data-grid">
        <DataCard
          title="认真刷播"
          badge="STREAM"
          snapshot={stream}
          placeholder="在该页面中直接开始刷播（无需但是建议加入运行组）"
        />
        <DataCard
          title="全力冲热"
          badge="TREND"
          snapshot={trend}
          placeholder="在该页面中启动冲热任务（需要加入运行组，与最新版插件配合使用）"
        />
      </div>

      <aside className="reality-group-card" aria-labelledby={`${headingId}-group-title`}>
        <div>
          <span aria-hidden="true">📡</span>
          <div>
            <h3 id={`${headingId}-group-title`}>加入运行组</h3>
            <p>需要参与实际运行时，请前往微博页面查看最新说明。</p>
          </div>
        </div>
        <a
          className="reality-primary-link"
          href={groupUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onGroupLinkClick}
        >
          打开运行组页面
          <span className="visually-hidden">（在新窗口打开）</span>
        </a>
      </aside>
    </section>
  )
}
