export { deriveActivityTiming } from './activities/timing'
export {
  ACTIVITY_APPLE_REWARDS,
  BASE_ACTIVITY_DURATION_MINUTES,
  BASE_ACTIVITY_DURATION_MS,
  DUPLICATE_APPLE_COMPENSATION,
  INITIAL_APPLES,
  INITIAL_INVENTORY,
  ITEM_IDS,
  ITEM_PRICES,
  PET_ENCOURAGEMENT_APPLE_COST,
  PITY_THRESHOLDS,
} from './game/constants'
export {
  COLLECTION_DROP_CHANCES,
  createDefaultGameBalance,
  DEFAULT_GAME_BALANCE,
  addProbabilityBonus,
  APPLE_LUNCHBOX_FRIEND_BONUS,
  FRIEND_EVENT_CHANCE,
  isValidActivityDuration,
  isValidProbability,
  LUCKY_APPLE_COLLECTION_DROP_BONUS,
  PROBABILITY_KEYS,
  type GameBalance,
  type GameProbabilities,
  type ProbabilityKey,
} from './game/gameBalance'
export { createInitialGameState, type InitialGameOptions } from './game/createGameState'
export {
  gameStateV1Schema,
  isStrictGameStateV1,
  migrateGameStateV1,
  migrateGameStateV1ToV2,
  type MigrateGameStateV1Options,
} from './game/migrateGameStateV1'
export { reduceGame } from './game/reducer'
export { normalizeImportedGameBalance } from './game/normalizeImportedGameBalance'
export { reconcileGameStateWithCatalog } from './game/reconcileGameStateWithCatalog'
export {
  validateImportedGameState,
  type ImportedGameStateValidation,
  type ImportedGameStateValidationCode,
} from './game/validateImportedGameState'
export {
  validateCollectionCatalog,
  type CollectionCatalogValidation,
} from './game/validateCollectionCatalog'
export type {
  ActivityKind,
  ActivityPhase,
  ActivityPreferences,
  ActivityRun,
  ActivityTiming,
  ClaimSummary,
  CollectionCatalog,
  CollectionEntry,
  CollectibleCategory,
  GameAction,
  GameEffect,
  GameError,
  GameErrorCode,
  GameState,
  GameStateV1,
  GameStateV2,
  GameTransition,
  Inventory,
  ItemId,
  PetLocation,
  PetState,
  PityState,
  RewardPlan,
  RoomArea,
  TaskBoard,
  TaskEvent,
  TaskId,
  TaskInstance,
  TaskTriggerGroup,
} from './game/types'
export {
  exhaustActivityPreference,
  generateActivityPreferences,
  getRefusalCountForRoll,
  isPetTired,
  type GeneratedPreferences,
} from './pet/preferences'
export { createRandomCursor, hashSeed, nextRandom, randomInteger } from './rewards/prng'
export { planActivityReward, type RewardPlanningInput } from './rewards/planReward'
export {
  canUseLuckyApple,
  getLuckyAppleAvailability,
  type LuckyAppleAvailability,
} from './rewards/luckyApple'
export {
  applyTaskEvent,
  generateTaskBoard,
  getTaskPresentation,
  getTaskProgressLabel,
  isTaskCompleted,
  TASK_LIBRARY,
  type GeneratedTaskBoard,
  type TaskPresentation,
  type TaskTemplate,
} from './tasks/taskBoard'
