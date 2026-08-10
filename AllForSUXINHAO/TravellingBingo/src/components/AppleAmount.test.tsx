import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppleAmount } from './AppleAmount'

describe('AppleAmount', () => {
  it('统一显示苹果数量，并只把数字交给乐融融字体节点', () => {
    const { container } = render(<AppleAmount value={3} prefix="+" />)

    expect(screen.getByLabelText('+3🍎')).toHaveTextContent('+3🍎')
    expect(container.querySelector('.apple-amount__number')).toHaveTextContent('+3')
  })
})
