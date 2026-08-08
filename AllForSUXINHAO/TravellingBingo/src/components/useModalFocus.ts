import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * 为自绘模态框提供焦点进入、Tab 圈定、Escape 关闭和焦点恢复。
 */
export function useModalFocus<T extends HTMLElement>(
  open: boolean,
  onClose?: () => void,
): RefObject<T | null> {
  const dialogRef = useRef<T>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const inerted: HTMLElement[] = []
    let activeBranch: HTMLElement | null = dialog.closest('.modal-backdrop') ?? dialog
    while (activeBranch?.parentElement) {
      for (const sibling of activeBranch.parentElement.children) {
        if (
          sibling !== activeBranch &&
          sibling instanceof HTMLElement &&
          !sibling.hasAttribute('inert')
        ) {
          sibling.setAttribute('inert', '')
          inerted.push(sibling)
        }
      }
      activeBranch = activeBranch.parentElement
      if (activeBranch === document.body) break
    }
    const focusable = () =>
      [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.hasAttribute('hidden') &&
          element.getAttribute('aria-hidden') !== 'true',
      )

    const activeInside =
      document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)
    if (!activeInside) (focusable()[0] ?? dialog).focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      const openModals = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter(
        (element) => !element.hidden && !element.closest('[hidden]'),
      )
      // 嵌套详情打开时，只允许最上层模态框处理 Escape 与 Tab。
      if (openModals.at(-1) !== dialog) return

      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const candidates = focusable()
      if (candidates.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = candidates[0]
      const last = candidates[candidates.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      for (const element of inerted) element.removeAttribute('inert')
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  return dialogRef
}
