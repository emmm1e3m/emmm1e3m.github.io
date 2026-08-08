import { useRegisterSW } from 'virtual:pwa-register/react'

import './PwaUpdatePrompt.css'

export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  const title = needRefresh ? '饼屋换上新布置啦' : '离线行囊收拾好啦'
  const description = needRefresh
    ? '打开新布置后，饼狗会在原地等你。'
    : '暂时没有网络，也能继续陪饼狗待在家里。'

  function dismiss() {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <aside
      className="pwa-prompt pwa-update-prompt"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby="pwa-update-title"
      aria-describedby="pwa-update-description"
    >
      <div className="pwa-update-prompt__copy">
        <strong id="pwa-update-title">{title}</strong>
        <span id="pwa-update-description">{description}</span>
      </div>
      <div className="pwa-update-prompt__actions">
        {needRefresh && (
          <button
            className="pwa-update-prompt__primary"
            type="button"
            onClick={() => void updateServiceWorker(true)}
          >
            看看新布置
          </button>
        )}
        <button type="button" onClick={dismiss}>
          {needRefresh ? '晚点再看' : '收好啦'}
        </button>
      </div>
    </aside>
  )
}
