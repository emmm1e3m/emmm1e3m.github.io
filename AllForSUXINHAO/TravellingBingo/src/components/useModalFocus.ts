import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export type ModalFocusTarget =
  HTMLElement | RefObject<HTMLElement | null> | (() => HTMLElement | null) | string

export interface ModalFocusOptions {
  /** 首次打开时优先聚焦的元素；选择器只会在当前弹窗内查找。 */
  initialFocus?: ModalFocusTarget
  /** 关闭后优先恢复的元素；传入 false 可关闭最终焦点恢复。 */
  returnFocus?: ModalFocusTarget | false
}

interface ModalEntry {
  dialog: HTMLElement
  previousFocus: HTMLElement | null
  rootReturnTarget: HTMLElement | null
}

interface InertRecord {
  element: HTMLElement
  originallyInert: boolean
}

const modalStack: ModalEntry[] = []
let inertRecords: InertRecord[] = []
let bodyLockCount = 0
let bodyOverflowBeforeLock = ''
let bodyPaddingRightBeforeLock = ''

function isInert(element: HTMLElement) {
  return element.hasAttribute('inert') || ('inert' in element && element.inert)
}

function isVisible(element: HTMLElement) {
  if (!element.isConnected) return false

  const checkVisibility = (
    element as HTMLElement & {
      checkVisibility?: (options?: {
        checkOpacity?: boolean
        checkVisibilityCSS?: boolean
      }) => boolean
    }
  ).checkVisibility
  if (checkVisibility) {
    try {
      if (!checkVisibility.call(element, { checkOpacity: true, checkVisibilityCSS: true })) {
        return false
      }
    } catch {
      // 旧版浏览器可能暴露方法但不接受选项，继续使用下方的兼容检查。
    }
  }

  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || isInert(current) || current.getAttribute('aria-hidden') === 'true') {
      return false
    }

    const style = window.getComputedStyle(current)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    ) {
      return false
    }
  }

  const closedDetails = element.closest('details:not([open])')
  if (closedDetails) {
    const summary = closedDetails.querySelector(':scope > summary')
    if (summary !== element && !summary?.contains(element)) return false
  }

  return true
}

function isFocusable(element: HTMLElement) {
  return (
    element.matches(FOCUSABLE_SELECTOR) &&
    !element.matches(':disabled') &&
    element.tabIndex >= 0 &&
    isVisible(element)
  )
}

function getFocusableElements(dialog: HTMLElement) {
  return [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isFocusable)
}

function resolveFocusTarget(
  target: ModalFocusTarget | undefined,
  selectorRoot: ParentNode,
): HTMLElement | null {
  if (!target) return null
  if (typeof target === 'string') return selectorRoot.querySelector<HTMLElement>(target)
  if (typeof target === 'function') return target()
  if (target instanceof HTMLElement) return target
  return target.current
}

function focusInside(dialog: HTMLElement, target?: ModalFocusTarget) {
  const requested = resolveFocusTarget(target, dialog)
  const destination =
    requested && dialog.contains(requested) && isFocusable(requested)
      ? requested
      : getFocusableElements(dialog)[0]

  if (destination) {
    destination.focus({ preventScroll: true })
    return document.activeElement === destination
  }

  dialog.focus({ preventScroll: true })
  return false
}

function releaseManagedInert() {
  for (const { element, originallyInert } of inertRecords) {
    if (!originallyInert) element.removeAttribute('inert')
  }
  inertRecords = []
}

function syncTopModalInert() {
  releaseManagedInert()
  const topDialog = modalStack.at(-1)?.dialog
  if (!topDialog?.isConnected) return

  let activeBranch: HTMLElement | null =
    topDialog.closest<HTMLElement>('.modal-backdrop, [data-modal-backdrop]') ?? topDialog

  while (activeBranch?.parentElement) {
    for (const sibling of activeBranch.parentElement.children) {
      if (sibling === activeBranch || !(sibling instanceof HTMLElement)) continue
      const originallyInert = isInert(sibling)
      if (!originallyInert) sibling.setAttribute('inert', '')
      inertRecords.push({ element: sibling, originallyInert })
    }

    activeBranch = activeBranch.parentElement
    if (activeBranch === document.body) break
  }
}

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow
    bodyPaddingRightBeforeLock = document.body.style.paddingRight

    const viewportWidth = document.documentElement.clientWidth
    const scrollbarWidth = viewportWidth > 0 ? Math.max(0, window.innerWidth - viewportWidth) : 0
    const currentPadding =
      Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`
  }
  bodyLockCount += 1
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount !== 0) return
  document.body.style.overflow = bodyOverflowBeforeLock
  document.body.style.paddingRight = bodyPaddingRightBeforeLock
}

/**
 * 为自绘模态框提供焦点进入、Tab 圈定、Escape 关闭、嵌套弹窗隔离和焦点恢复。
 */
export function useModalFocus<T extends HTMLElement>(
  open: boolean,
  onClose?: () => void,
  options: ModalFocusOptions = {},
): RefObject<T | null> {
  const dialogRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  const optionsRef = useRef(options)

  useEffect(() => {
    closeRef.current = onClose
    optionsRef.current = options
  }, [onClose, options])

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const parentEntry = modalStack.at(-1)
    const returnSettingAtOpen = optionsRef.current.returnFocus
    const entry: ModalEntry = {
      dialog,
      previousFocus,
      rootReturnTarget: parentEntry
        ? parentEntry.rootReturnTarget
        : returnSettingAtOpen === false
          ? null
          : (resolveFocusTarget(returnSettingAtOpen, document) ?? previousFocus),
    }

    modalStack.push(entry)
    lockBodyScroll()
    syncTopModalInert()

    const isTopModal = () => modalStack.at(-1) === entry
    const activeInside =
      document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)
    const initialFocusReached = activeInside
      ? document.activeElement !== dialog
      : focusInside(dialog, optionsRef.current.initialFocus)
    let focusRetryFrame: number | null = null
    let focusRetryTimer: ReturnType<typeof globalThis.setTimeout> | null = null

    const retryInitialFocus = () => {
      if (!isTopModal()) return
      const active = document.activeElement
      // 用户已经主动移到弹窗里的控件时，不再抢回指定的初始位置。
      if (active instanceof HTMLElement && dialog.contains(active) && active !== dialog) return
      focusInside(dialog, optionsRef.current.initialFocus)
    }

    if (!initialFocusReached) {
      dialog.addEventListener('animationend', retryInitialFocus)
      dialog.addEventListener('transitionend', retryInitialFocus)
      if (typeof window.requestAnimationFrame === 'function') {
        focusRetryFrame = window.requestAnimationFrame(retryInitialFocus)
      }
      focusRetryTimer = globalThis.setTimeout(retryInitialFocus, 360)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModal()) return

      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const candidates = getFocusableElements(dialog)
      if (candidates.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const first = candidates[0]
      const last = candidates[candidates.length - 1]
      const active = document.activeElement
      const activeIndex = active instanceof HTMLElement ? candidates.indexOf(active) : -1

      if (event.shiftKey && (activeIndex <= 0 || !dialog.contains(active))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && (activeIndex === candidates.length - 1 || activeIndex === -1)) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopModal()) return
      const target = event.target
      if (target instanceof HTMLElement && dialog.contains(target) && isVisible(target)) return
      focusInside(dialog, optionsRef.current.initialFocus)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn)
      dialog.removeEventListener('animationend', retryInitialFocus)
      dialog.removeEventListener('transitionend', retryInitialFocus)
      if (focusRetryFrame !== null) window.cancelAnimationFrame(focusRetryFrame)
      if (focusRetryTimer !== null) globalThis.clearTimeout(focusRetryTimer)

      const wasTopModal = isTopModal()
      const entryIndex = modalStack.indexOf(entry)
      if (entryIndex >= 0) modalStack.splice(entryIndex, 1)
      unlockBodyScroll()
      syncTopModalInert()

      if (!wasTopModal) return

      const remainingDialog = modalStack.at(-1)?.dialog
      const returnSetting = optionsRef.current.returnFocus
      const requestedReturn =
        returnSetting === false ? null : resolveFocusTarget(returnSetting, document)
      const returnTarget = returnSetting === false ? null : (requestedReturn ?? previousFocus)

      if (returnTarget && isVisible(returnTarget)) {
        returnTarget.focus({ preventScroll: true })
      } else if (remainingDialog?.isConnected) {
        focusInside(remainingDialog)
      } else if (
        returnSetting !== false &&
        entry.rootReturnTarget &&
        isVisible(entry.rootReturnTarget)
      ) {
        entry.rootReturnTarget.focus({ preventScroll: true })
      }
    }
  }, [open])

  return dialogRef
}
