import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import realityStyles from './reality.css?raw'
import { PostcardPicker } from './PostcardPicker'

const options = [
  { id: 'sea', title: '海边明信片', thumbnailUrl: '/sea.webp', aspectRatio: 2 / 3 },
  { id: 'sunset', title: '晚霞明信片', thumbnailUrl: '/sunset.webp', aspectRatio: 16 / 9 },
]

describe('PostcardPicker', () => {
  it('用按钮打开完整全屏明信片墙，单击明信片后立即提交并关闭', async () => {
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
    expect(onChange).toHaveBeenCalledWith('sunset')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '确认明信片' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '选择这一轮的风景' })).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('单击当前已选中的明信片也会确定并关闭', () => {
    const onChange = vi.fn()
    render(<PostcardPicker options={options} selectedId="sea" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '选择陪伴明信片' }))
    fireEvent.click(screen.getByRole('radio', { name: /海边明信片/u }))

    expect(onChange).toHaveBeenCalledWith('sea')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: '选择这一轮的风景' })).not.toBeInTheDocument()
  })

  it('取消或 Escape 不改变选择，并把焦点还给入口按钮', async () => {
    const onChange = vi.fn()
    render(<PostcardPicker options={options} selectedId="sea" onChange={onChange} />)
    const trigger = screen.getByRole('button', { name: '选择陪伴明信片' })

    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onChange).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('dialog', { name: '选择这一轮的风景' }), {
      key: 'Escape',
    })

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

  it('入口预览按当前明信片宽高比调整左栏并让图片铺满', () => {
    const { container, rerender } = render(
      <PostcardPicker options={options} selectedId="sea" onChange={vi.fn()} />,
    )
    const preview = container.querySelector<HTMLElement>('.reality-postcard-picker__preview')
    expect(preview).toHaveStyle({ '--postcard-preview-width': '112px' })

    rerender(<PostcardPicker options={options} selectedId="sunset" onChange={vi.fn()} />)
    expect(preview).toHaveStyle({ '--postcard-preview-width': '299px' })
    expect(realityStyles).toMatch(
      /\.reality-postcard-picker__preview\s*\{[^}]*grid-template-columns:[^;]*--postcard-preview-width/su,
    )
    expect(realityStyles).toMatch(
      /\.reality-postcard-picker__preview > img,[\s\S]*?object-fit:\s*cover;/u,
    )
  })
})
