import { createRoot } from 'react-dom/client'

import '@/styles/fonts.css'
import '@/styles/global.css'

import { StreamPlayerApp } from './StreamPlayerApp'
import './stream-player.css'

const root = document.getElementById('stream-player-root')

if (!root) {
  throw new Error('找不到刷播页挂载节点')
}

createRoot(root).render(<StreamPlayerApp />)
