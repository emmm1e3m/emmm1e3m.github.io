import type { StreamPlaybackMode } from './catalog'

export const FULL_VIDEO_POPUP_FEATURES =
  'popup=yes,width=960,height=720,resizable=yes,scrollbars=yes'

/** 新标签页与弹出窗口共用同一条完整视频页面打开路径。 */
export function openFullVideoTarget(url: string, mode: Exclude<StreamPlaybackMode, 'silent'>) {
  const features = mode === 'popup' ? FULL_VIDEO_POPUP_FEATURES : undefined
  let handle: Window | null = null
  try {
    handle = window.open('', '_blank', features)
    if (handle === null) return null
    handle.opener = null
    handle.location.replace(url)
    return handle
  } catch {
    try {
      handle?.close()
    } catch {
      // 浏览器拒绝访问窗口句柄时直接按打开失败处理。
    }
    return null
  }
}
