export interface UpdateNoticeEntry {
  title: string
  detail: string
}

export interface UpdateNotice {
  version: string
  publishedDate: string
  publishedLabel: string
  title: string
  summary: string
  highlight: string
  entries: readonly UpdateNoticeEntry[]
}

/** 标题页摘要与房间公告弹窗共用这一份更新内容。 */
export const CURRENT_UPDATE_NOTICE: UpdateNotice = {
  version: 'v0.10',
  publishedDate: '2026-08-11',
  publishedLabel: '2026.08.11',
  title: '饼屋的新布置',
  summary: '奇迹饼狗、在线刷播工具与一批新的房间细节已经准备好。',
  highlight: '刷播现在可以正常使用了',
  entries: [
    {
      title: '奇迹饼狗上线',
      detail: '衣架已经准备好入口，可以购买衣服，为饼狗和认识的朋友自由搭配。',
    },
    {
      title: '多套造型随心保存',
      detail: '拖动、缩放、旋转并调整衣服层级，把喜欢的搭配保存成不同造型。',
    },
    {
      title: '合拍相册开张',
      detail: '挑一张收藏的明信片布置合拍，保存到相册后还可以下载或删除。',
    },
    {
      title: '在线刷播工具就绪',
      detail: 'SUperView 独立窗口会保留轮次与记录，返回游戏维度也可以继续运行。',
    },
  ],
}
