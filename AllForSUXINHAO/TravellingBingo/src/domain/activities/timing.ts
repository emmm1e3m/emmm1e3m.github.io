import type { ActivityRun, ActivityTiming } from '../game/types'

function assertValidNow(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError('当前时间必须是非负安全整数毫秒时间戳')
  }
}

/**
 * 任务进度只由绝对时间戳推导，不把倒计时快照写入状态。
 * 边界前 1ms 仍在运行，恰好到 endsAt 时即可领取。
 */
export function deriveActivityTiming(activity: ActivityRun | null, now: number): ActivityTiming {
  assertValidNow(now)

  if (activity === null) {
    return { phase: 'idle', remainingMs: 0, remainingSeconds: 0, progress: 0 }
  }

  const duration = activity.endsAt - activity.startedAt
  const remainingMs = Math.max(0, activity.endsAt - now)
  const elapsed = Math.max(0, Math.min(duration, now - activity.startedAt))

  return {
    phase: remainingMs === 0 ? 'ready' : 'running',
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1_000),
    progress: duration <= 0 ? 1 : elapsed / duration,
  }
}
