import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import realityStyles from './reality.css?raw'
import { PostcardPicker } from './PostcardPicker'

const options = [
  { id: 'sea', title: '海边明信片', thumbnailUrl: '/sea.webp' },
  { id: 'sunset', title: '晚霞明信片', thumbnailUrl: '/sunset.webp' },
]

describe('PostcardPicker', () => {
  it('用按钮打开完整全屏明信片墙，确认后才提交草稿选择', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <PostcardPicker options={options} selectedId="sea" onChange={onChange} />,
    )

    const trigger = screen.getByRole('button', { name: '选择陪伴明信片' })
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '选择这一轮的风景' })
    expect(dialog.parentElement?.parentElement).toBe(document.body)
    expect(container).not.toContainElement(dialog)
    expect(dialog.querySelector('.reality-postcard-dialog__wall')).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: '取消' })).toHaveFocus())

    fireEvent.click(screen.getByRole('radio', { name: /晚霞明信片/u }))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认明信片' }))
    expect(onChange).toHaveBeenCalledWith('sunset')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('取消或 Escape 放弃草稿并把焦点还给入口按钮', async () => {
    const onChange = vi.fn()
    render(<PostcardPicker options={options} selectedId="sea" onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: '选择陪伴明信片' })

    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '选择这一轮的风景' })
    fireEvent.click(screen.getByRole('radio', { name: /晚霞明信片/u }))
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(onChange).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('dialog', { name: '选择这一轮的风景' })).not.toBeInTheDocument()
  })

  it('全页本身滚动，不给明信片网格设置小滚动框', () => {
    expect(realityStyles).toMatch(
      /\.reality-postcard-dialog-backdrop\s*\{[\s\S]*?overflow-y: auto;/u,
    )
    expect(realityStyles).toMatch(
      /\.reality-postcard-dialog__wall\s*\{[\s\S]*?grid-template-columns:/u,
    )
    expect(realityStyles).not.toMatch(
      /\.reality-postcard-dialog__wall\s*\{[^}]*?(?:max-height|overflow-y):/u,
    )
  })
})
