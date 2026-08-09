import { useId } from 'react'

import type { DataPanelProps } from './types'
import './reality.css'

const DEFAULT_GROUP_URL = 'https://www.weibo.com/u/7878664767'

export function DataPanel({
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
      <aside className="reality-group-card reality-group-card--centered">
        <div>
          <div>
            <h2 id={headingId}>冲热刷播，奖品多多</h2>
          </div>
        </div>
        <a
          className="reality-primary-link"
          href={groupUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onGroupLinkClick}
        >
          前往字母建设站
          <span className="visually-hidden">（在新窗口打开）</span>
        </a>
      </aside>
    </section>
  )
}
