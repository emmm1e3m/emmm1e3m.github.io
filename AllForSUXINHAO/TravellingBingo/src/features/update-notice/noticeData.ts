export interface UpdateNoticeEntry {
  title: string
  detail: string
}

export interface UpdateNotice {
  publishedDate: string
  publishedLabel: string
  title: string
  summary: string
  warning: string
  entries: readonly UpdateNoticeEntry[]
}

/** 标题页摘要与房间公告弹窗共用这一份更新内容。 */
export const CURRENT_UPDATE_NOTICE: UpdateNotice = {
  publishedDate: '2026-08-11',
  publishedLabel: '2026.08.11',
  title: '饼屋的新布置',
  summary: '刷播搬进独立窗口，公告入口也来到房间里。',
  warning: '目前刷播功能不稳定，请暂时不要通过此方式刷播',
  entries: [
    {
      title: '刷播独立成窗',
      detail: '设置好收藏夹、自测视频与时长后，会打开独立窗口继续刷播。',
    },
    {
      title: '收藏夹留在本地',
      detail: '刷播清单改为随游戏发布，每轮随机排列，自测视频留在最后。',
    },
    {
      title: '现实维度更自由',
      detail: '手机也能进入现实维度；冲热仍需要在电脑上使用。',
    },
    {
      title: '一些小修整',
      detail: '补充更新公告入口，并调整道具说明与互动提示。',
    },
  ],
}
