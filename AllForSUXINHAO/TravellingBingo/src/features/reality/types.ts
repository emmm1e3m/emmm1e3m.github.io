import type { ReactNode } from 'react'

export const REALITY_PANEL_IDS = {
  data: 'data',
  work: 'work',
  recordPlayer: 'record-player',
} as const

export type BuiltInRealityPanelId = (typeof REALITY_PANEL_IDS)[keyof typeof REALITY_PANEL_IDS]

export interface RealityDashboardPanel {
  id: string
  label: string
  /** 展示入口所在的位置，例如“二楼电脑”。 */
  location?: string
  icon?: ReactNode
  content: ReactNode
  disabled?: boolean
}

export interface RealityDashboardProps {
  panels: readonly RealityDashboardPanel[]
  activePanelId: string
  onPanelChange: (panelId: string) => void
  title?: string
  description?: string
  /** 由 App 映射为 reality/leave；组件不自行切换 world。 */
  onClose?: () => void
  closeLabel?: string
  className?: string
}

export interface RealityDataSnapshot {
  statusLabel: string
  detail: string
}

export interface DataPanelProps {
  stream?: RealityDataSnapshot | null
  trend?: RealityDataSnapshot | null
  groupUrl?: string
  onGroupLinkClick?: () => void
  className?: string
}

export interface PomodoroDurationOption {
  durationMs: number
  label: string
  description?: string
}

export interface PomodoroSessionView {
  sessionId: string
  status: 'running' | 'completed'
  statusLabel: string
  /** 由 App 格式化，组件不根据时间戳自行倒计时。 */
  remainingLabel?: string
}

export interface PomodoroView {
  selectedDurationMs: number
  durationOptions: readonly PomodoroDurationOption[]
  session: PomodoroSessionView | null
  canStart?: boolean
}

export interface PostcardBackgroundOption {
  id: string
  title: string
  thumbnailUrl?: string
  description?: string
}

export interface RealityTodoView {
  id: string
  title: string
  completed: boolean
  dueLabel?: string | null
}

export type RealityNotificationPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export interface RealityNotificationView {
  permission: RealityNotificationPermission
  statusLabel?: string
}

export interface TodoUpdateInput {
  title?: string
}

export interface WorkPanelActions {
  onDurationChange: (durationMs: number) => void
  onPomodoroStart: (durationMs: number) => void
  onPomodoroCancel?: (sessionId: string) => void
  onBackgroundChange: (postcardId: string | null) => void
  onTodoCreate: (title: string) => void
  onTodoUpdate: (todoId: string, update: TodoUpdateInput) => void
  onTodoCompletionChange: (todoId: string, completed: boolean) => void
  onTodoDelete: (todoId: string) => void
  /** 仅转交用户点击；组件自身不会访问 Notification API。 */
  onNotificationRequest?: () => void
}

export interface WorkPanelProps {
  pomodoro: PomodoroView
  unlockedBackgrounds: readonly PostcardBackgroundOption[]
  selectedBackgroundId: string | null
  todos: readonly RealityTodoView[]
  actions: WorkPanelActions
  notification?: RealityNotificationView
  /** 房间左下角发出的一次性“打开苹果钟取消确认”请求。 */
  cancelRequestToken?: number | null
  onCancelRequestHandled?: (token: number) => void
  className?: string
}

export type RealityRewardDecision = 'serious' | 'not-serious'

export interface RealityReturnDialogProps {
  open: boolean
  fullRewardApples: number
  onDecision: (decision: RealityRewardDecision) => void
  onDismiss?: () => void
  returnFocus?: HTMLElement | null | (() => HTMLElement | null)
}
