import type { ActivityKind, ItemId } from '@/domain'

export const ITEM_COPY: Record<ItemId, { emoji: string; name: string; note: string }> = {
  'travel-basic': { emoji: '🍱', name: '普通旅行便当', note: '装好一次出门需要的点心' },
  'travel-apple': {
    emoji: '🍎',
    name: '苹果旅行便当',
    note: '让这次旅行遇见朋友的机会翻倍',
  },
  'signal-headphones': { emoji: '🎧', name: '信号耳机', note: '陪饼狗认真刷播一次' },
  'trend-toolbox': {
    emoji: '🧰',
    name: '热度工具箱',
    note: '陪饼狗向全站第一冲刺',
  },
  'lucky-apple': { emoji: '🍀', name: '幸运苹果', note: '让这次留下收藏的机会翻倍' },
  'bottled-speed-magic': {
    emoji: '⚡',
    name: '瓶装速度魔法',
    note: '让正在进行的活动立刻完成',
  },
  'bottled-vitality-magic': {
    emoji: '✨',
    name: '瓶装活力魔法',
    note: '让饼狗接下来七个相伴日都充满活力',
  },
}

export const ACTIVITY_COPY: Record<
  ActivityKind,
  { name: string; verb: string; note: string; supply: ItemId | null; refuse: string }
> = {
  travel: {
    name: '出去旅行',
    verb: '旅行中',
    note: '去外面的世界走走，把真实的旅途留进收藏墙。',
    supply: 'travel-basic',
    refuse: '饼狗今天更想待在家里',
  },
  stream: {
    name: '认真刷播',
    verb: '刷播中',
    note: '在电脑前好好陪伴，加速百万直拍的达成。',
    supply: 'signal-headphones',
    refuse: '饼狗今天不想坐在电脑前',
  },
  trend: {
    name: '全力冲热',
    verb: '冲热中',
    note: '向珍贵的全站第一发起一次冲刺。',
    supply: 'trend-toolbox',
    refuse: '饼狗今天想把力气留给别的事',
  },
  music: {
    name: '一起弹琴',
    verb: '音乐时间',
    note: '认识的朋友越多，琴声越容易唤来熟悉的朋友，也越可能收到更多苹果。',
    supply: null,
    refuse: '饼狗今天想让房间安静一点',
  },
  rest: {
    name: '好好睡一觉',
    verb: '睡觉中',
    note: '窗外会慢慢暗下来，再和醒来的饼狗迎接新一天。',
    supply: null,
    refuse: '饼狗已经在床边准备好啦',
  },
}

export const FRIEND_NAMES: Record<string, string> = {
  'class-representative-bing': '课代饼',
  'san-hao-rabbit': '三好兔',
  'xin-hao-rabbit': '心好兔',
  'signal-dog': '信号狗',
  'bili-bing': '饼哩饼哩',
}

export const STAGE_TEST_URL = 'https://www.bilibili.com/toy/Suxinhao_XHTI_stagetest/index.html'

export function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return [minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':')
}
