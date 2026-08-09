import { ROOM_AREAS, roomAreaVisibleInWorld, type RoomPixelPoint } from './roomConfig'

export const ROOM_WANDER_REST_MIN_MS = 4_800
export const ROOM_WANDER_REST_MAX_MS = 10_800
export const ROOM_WANDER_MOVE_MIN_MS = 4_800
export const ROOM_WANDER_MOVE_MAX_MS = 6_800

export type RoomWanderPhase = 'resting' | 'moving'

/** 每次停留和移动都重新取时长，避免待机动作呈现机械的固定节拍。 */
export function randomRoomWanderDuration(phase: RoomWanderPhase, random: () => number) {
  const [minimum, maximum] =
    phase === 'resting'
      ? [ROOM_WANDER_REST_MIN_MS, ROOM_WANDER_REST_MAX_MS]
      : [ROOM_WANDER_MOVE_MIN_MS, ROOM_WANDER_MOVE_MAX_MS]
  return minimum + Math.round(random() * (maximum - minimum))
}

function turn(origin: RoomPixelPoint, first: RoomPixelPoint, second: RoomPixelPoint) {
  return (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
}

/** 单调链算法返回覆盖全部设施落点的最小凸多边形。 */
export function buildRoomConvexHull(points: readonly RoomPixelPoint[]): RoomPixelPoint[] {
  const sorted = [...points]
    .sort((first, second) => first.x - second.x || first.y - second.y)
    .filter(
      (point, index, entries) =>
        index === 0 || point.x !== entries[index - 1]!.x || point.y !== entries[index - 1]!.y,
    )
  if (sorted.length <= 2) return sorted

  const lower: RoomPixelPoint[] = []
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      turn(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
    ) {
      lower.pop()
    }
    lower.push(point)
  }

  const upper: RoomPixelPoint[] = []
  for (const point of [...sorted].reverse()) {
    while (
      upper.length >= 2 &&
      turn(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
    ) {
      upper.pop()
    }
    upper.push(point)
  }

  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

export function roomPointInsideConvexHull(point: RoomPixelPoint, hull: readonly RoomPixelPoint[]) {
  if (hull.length < 3) return false
  return hull.every((current, index) => turn(current, hull[(index + 1) % hull.length]!, point) >= 0)
}

/** 在凸包三角扇内部取点；内缩的重心权重避免落回设施顶点或边界。 */
export function randomRoomPointInHull(
  hull: readonly RoomPixelPoint[],
  random: () => number,
): RoomPixelPoint {
  if (hull.length < 3) throw new TypeError('房间漫步边界至少需要三个点')

  const anchor = hull[0]!
  const triangles = hull.slice(1, -1).map((first, index) => {
    const second = hull[index + 2]!
    return { first, second, area: Math.abs(turn(anchor, first, second)) / 2 }
  })
  const totalArea = triangles.reduce((sum, triangle) => sum + triangle.area, 0)
  let selectedArea = random() * totalArea
  const triangle =
    triangles.find((candidate) => {
      selectedArea -= candidate.area
      return selectedArea <= 0
    }) ?? triangles[triangles.length - 1]!

  const inward = 0.08
  const root = Math.sqrt(inward + random() * (1 - inward * 2))
  const across = inward + random() * (1 - inward * 2)
  return {
    x:
      (1 - root) * anchor.x +
      root * (1 - across) * triangle.first.x +
      root * across * triangle.second.x,
    y:
      (1 - root) * anchor.y +
      root * (1 - across) * triangle.first.y +
      root * across * triangle.second.y,
  }
}

export const GAME_ROOM_WANDER_HULL = buildRoomConvexHull(
  ROOM_AREAS.filter((area) => roomAreaVisibleInWorld(area, 'game')).map((area) => area.petCenter),
)
