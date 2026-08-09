import { useId, useRef, type KeyboardEvent } from 'react'

import type { RealityDashboardProps } from './types'
import './reality.css'

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/gu, '-')
}

export function RealityDashboard({
  panels,
  activePanelId,
  onPanelChange,
  title = '现实生活',
  description = '在这里安排现实里的事情，处理完再回到饼狗身边。',
  onClose,
  closeLabel = '回到饼屋',
  className = '',
}: RealityDashboardProps) {
  const idPrefix = useId().replace(/:/gu, '')
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const enabledPanels = panels.filter((panel) => !panel.disabled)

  function moveTabFocus(event: KeyboardEvent<HTMLButtonElement>, panelId: string) {
    const currentIndex = enabledPanels.findIndex((panel) => panel.id === panelId)
    if (currentIndex < 0) return

    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % enabledPanels.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + enabledPanels.length) % enabledPanels.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = enabledPanels.length - 1
    }

    if (nextIndex === null) return
    event.preventDefault()
    const nextPanel = enabledPanels[nextIndex]
    if (!nextPanel) return
    onPanelChange(nextPanel.id)
    tabRefs.current.get(nextPanel.id)?.focus()
  }

  return (
    <section
      className={`reality-dashboard ${className}`.trim()}
      aria-labelledby={`${idPrefix}-reality-title`}
    >
      <header className="reality-dashboard__header">
        <div>
          <h2 id={`${idPrefix}-reality-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        {onClose && (
          <button className="reality-return-button" type="button" onClick={onClose}>
            <span aria-hidden="true">↩</span>
            {closeLabel}
          </button>
        )}
      </header>

      <p className="reality-dashboard__reward-note">
        <span aria-hidden="true">🍎</span>
        在现实生活里每度过完整的 10 分钟，会先攒下 1🍎；回到饼屋时，再告诉饼狗有没有认真完成。
      </p>

      {panels.length > 0 ? (
        <>
          <div className="reality-tabs" role="tablist" aria-label="现实生活区域">
            {panels.map((panel) => {
              const selected = panel.id === activePanelId
              const panelKey = `${idPrefix}-${safeId(panel.id)}`
              return (
                <button
                  key={panel.id}
                  ref={(node) => {
                    if (node) tabRefs.current.set(panel.id, node)
                    else tabRefs.current.delete(panel.id)
                  }}
                  id={`${panelKey}-tab`}
                  className="reality-tab"
                  type="button"
                  role="tab"
                  aria-controls={`${panelKey}-panel`}
                  aria-selected={selected}
                  disabled={panel.disabled}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onPanelChange(panel.id)}
                  onKeyDown={(event) => moveTabFocus(event, panel.id)}
                >
                  {panel.icon && (
                    <span className="reality-tab__icon" aria-hidden="true">
                      {panel.icon}
                    </span>
                  )}
                  <span className="reality-tab__copy">
                    <strong>{panel.label}</strong>
                    {panel.location && <small>{panel.location}</small>}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="reality-dashboard__panels">
            {panels.map((panel) => {
              const panelKey = `${idPrefix}-${safeId(panel.id)}`
              return (
                <div
                  key={panel.id}
                  id={`${panelKey}-panel`}
                  className="reality-dashboard__panel"
                  role="tabpanel"
                  aria-labelledby={`${panelKey}-tab`}
                  hidden={panel.id !== activePanelId}
                  tabIndex={0}
                >
                  {panel.content}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className="reality-empty" role="status">
          这里还没有可以打开的现实生活区域。
        </p>
      )}
    </section>
  )
}
