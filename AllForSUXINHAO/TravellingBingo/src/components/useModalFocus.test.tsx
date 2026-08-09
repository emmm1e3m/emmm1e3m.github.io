import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'

import { useModalFocus } from './useModalFocus'

function NestedModalHarness() {
  const [outerOpen, setOuterOpen] = useState(false)
  const [innerOpen, setInnerOpen] = useState(false)
  const outerRef = useModalFocus<HTMLElement>(outerOpen, () => setOuterOpen(false))
  const innerRef = useModalFocus<HTMLElement>(innerOpen, () => setInnerOpen(false))

  return (
    <div>
      <button type="button" onClick={() => setOuterOpen(true)}>
        打开房间菜单
      </button>
      <button type="button">页面上的其他操作</button>

      {outerOpen && (
        <section ref={outerRef} role="dialog" aria-modal="true" aria-label="房间菜单" tabIndex={-1}>
          <button type="button" style={{ display: 'none' }}>
            看不见的按钮
          </button>
          <div inert>
            <button type="button">不可互动的按钮</button>
          </div>
          <button type="button" onClick={() => setInnerOpen(true)}>
            打开收藏详情
          </button>
          <button type="button" onClick={() => setOuterOpen(false)}>
            关闭房间菜单
          </button>

          {innerOpen && (
            <div className="modal-backdrop">
              <article
                ref={innerRef}
                role="dialog"
                aria-modal="true"
                aria-label="收藏详情"
                tabIndex={-1}
              >
                <button type="button" onClick={() => setInnerOpen(false)}>
                  关闭收藏详情
                </button>
              </article>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function ConfigurableModalHarness() {
  const [open, setOpen] = useState(false)
  const returnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLElement>(open, () => setOpen(false), {
    initialFocus: '[data-initial-focus]',
    returnFocus: returnRef,
  })

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        普通触发按钮
      </button>
      <button ref={returnRef} type="button">
        指定返回位置
      </button>
      {open && (
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="自选焦点"
          tabIndex={-1}
        >
          <button type="button">第一个按钮</button>
          <button type="button" data-initial-focus onClick={() => setOpen(false)}>
            指定初始按钮
          </button>
        </section>
      )}
    </div>
  )
}

function AnimatedModalHarness({ visible }: { visible: boolean }) {
  const dialogRef = useModalFocus<HTMLElement>(true, undefined, {
    initialFocus: '[data-initial-focus]',
  })

  return (
    <section
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="淡入弹窗"
      tabIndex={-1}
      style={{ opacity: visible ? 1 : 0 }}
    >
      <button type="button" data-initial-focus>
        返回房间
      </button>
    </section>
  )
}

function PeerModalHarness() {
  const [open, setOpen] = useState(false)
  const dialogRef = useModalFocus<HTMLElement>(open, () => setOpen(false), {
    focusPeers: ['[data-modal-focus-peer="test-player"]'],
  })

  return (
    <>
      <main>
        <button type="button" onClick={() => setOpen(true)}>
          打开带播放器的弹窗
        </button>
        <button type="button">背景操作</button>
        {open && (
          <div className="modal-backdrop">
            <section
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="带播放器的弹窗"
              tabIndex={-1}
            >
              <button type="button">弹窗操作</button>
            </section>
          </div>
        )}
      </main>
      <aside data-modal-focus-peer="test-player">
        <button type="button">播放器操作</button>
        <iframe title="测试播放器" />
      </aside>
    </>
  )
}

describe('useModalFocus', () => {
  it('过滤不可见与 inert 元素，并把 Tab 和外部焦点留在最上层弹窗', async () => {
    render(<NestedModalHarness />)
    const outerTrigger = screen.getByRole('button', { name: '打开房间菜单' })
    outerTrigger.focus()
    fireEvent.click(outerTrigger)

    const openDetail = screen.getByRole('button', { name: '打开收藏详情' })
    const closeOuter = screen.getByRole('button', { name: '关闭房间菜单' })
    expect(openDetail).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(closeOuter).toHaveFocus()

    screen.getByRole('button', { name: '页面上的其他操作' }).focus()
    expect(openDetail).toHaveFocus()

    fireEvent.click(openDetail)
    const innerClose = screen.getByRole('button', { name: '关闭收藏详情' })
    expect(innerClose).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '收藏详情' })).toBeNull())
    expect(openDetail).toHaveFocus()
    expect(screen.getByRole('dialog', { name: '房间菜单' })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '房间菜单' })).toBeNull())
    expect(outerTrigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('支持指定初始焦点和关闭后的返回位置', async () => {
    render(<ConfigurableModalHarness />)
    fireEvent.click(screen.getByRole('button', { name: '普通触发按钮' }))

    const initial = screen.getByRole('button', { name: '指定初始按钮' })
    expect(initial).toHaveFocus()
    fireEvent.click(initial)

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '自选焦点' })).toBeNull())
    expect(screen.getByRole('button', { name: '指定返回位置' })).toHaveFocus()
  })

  it('淡入动画首帧不可见时，在动画可见后补上初始焦点', () => {
    const { rerender } = render(<AnimatedModalHarness visible={false} />)
    const dialog = screen.getByRole('dialog', { name: '淡入弹窗' })
    const returnButton = screen.getByRole('button', { name: '返回房间' })

    expect(dialog).toHaveFocus()
    expect(returnButton).not.toHaveFocus()

    rerender(<AnimatedModalHarness visible />)
    fireEvent.animationEnd(dialog)

    expect(returnButton).toHaveFocus()
  })

  it('明确 peer 不会被 inert，并与弹窗共同参与焦点圈定', () => {
    render(<PeerModalHarness />)
    fireEvent.click(screen.getByRole('button', { name: '打开带播放器的弹窗' }))

    const dialogButton = screen.getByRole('button', { name: '弹窗操作' })
    const playerButton = screen.getByRole('button', { name: '播放器操作' })
    const iframe = screen.getByTitle('测试播放器')
    expect(screen.getByRole('button', { name: '背景操作' })).toHaveAttribute('inert')
    expect(playerButton.closest('[inert]')).toBeNull()

    playerButton.focus()
    expect(playerButton).toHaveFocus()
    iframe.focus()
    fireEvent.keyDown(iframe, { key: 'Tab' })
    expect(dialogButton).toHaveFocus()
  })
})
