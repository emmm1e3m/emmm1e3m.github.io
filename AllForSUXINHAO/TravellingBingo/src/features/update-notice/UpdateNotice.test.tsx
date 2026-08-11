import { fireEvent, render, screen } from '@testing-library/react'

import { CURRENT_UPDATE_NOTICE } from './noticeData'
import { UpdateNoticeCard, UpdateNoticeDialog } from './UpdateNotice'

describe('v0.10 更新公告', () => {
  it('使用一份版本化公告数据描述本轮功能', () => {
    expect(CURRENT_UPDATE_NOTICE).toMatchObject({
      version: 'v0.10',
      highlight: '刷播现在可以正常使用了',
    })
    expect(CURRENT_UPDATE_NOTICE.entries.map((entry) => entry.title)).toEqual([
      '奇迹饼狗上线',
      '多套造型随心保存',
      '合拍相册开张',
      '在线刷播工具就绪',
    ])
    expect(CURRENT_UPDATE_NOTICE).not.toHaveProperty('warning')
  })

  it('公告卡片显示版本与可用状态，并转交打开动作', () => {
    const onOpen = vi.fn()
    render(<UpdateNoticeCard onOpen={onOpen} />)

    const card = screen.getByRole('button', {
      name: /更新公告 · v0\.10 · 饼屋的新布置/u,
    })
    expect(card).toHaveTextContent('刷播现在可以正常使用了')
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('房间与标题页共用的弹窗显示版本、奇迹饼狗与合拍内容', () => {
    const onClose = vi.fn()
    render(<UpdateNoticeDialog open onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: '饼屋的新布置' })
    expect(dialog).toHaveTextContent('更新公告 · v0.10')
    expect(dialog).toHaveTextContent('奇迹饼狗上线')
    expect(dialog).toHaveTextContent('多套造型随心保存')
    expect(dialog).toHaveTextContent('合拍相册开张')
    expect(dialog).toHaveTextContent('刷播现在可以正常使用了')

    fireEvent.click(screen.getByRole('button', { name: '收好啦' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
