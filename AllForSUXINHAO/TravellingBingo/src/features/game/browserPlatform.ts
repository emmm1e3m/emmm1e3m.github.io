export interface BrowserPlatformSnapshot {
  hasDesktopPointer: boolean
}

export function isPcBrowser({ hasDesktopPointer }: BrowserPlatformSnapshot): boolean {
  return hasDesktopPointer
}

export function detectPcBrowser(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false

  return isPcBrowser({
    hasDesktopPointer: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  })
}
