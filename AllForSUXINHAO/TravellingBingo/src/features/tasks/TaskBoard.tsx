import {
  getTaskPresentation,
  getTaskProgressLabel,
  isTaskCompleted,
  type GameState,
} from '@/domain'

export function TaskBoard({ game }: { game: GameState }) {
  const tasks = game.tasks.active

  return (
    <section className="task-board" aria-labelledby="task-board-title">
      <div className="task-board__heading">
        <div>
          <span className="eyebrow">今日 Bingo</span>
          <h3 id="task-board-title">和饼狗一起做三件小事</h3>
        </div>
        <span className="bingo-stamp" aria-label="Bingo">
          Bingo!
        </span>
      </div>
      <ol className="task-list">
        {tasks.map((task, index) => {
          const copy = getTaskPresentation(task.taskId)
          const complete = isTaskCompleted(task)
          return (
            <li key={task.instanceId} className={complete ? 'is-complete' : ''}>
              <span className="task-number" aria-hidden="true">
                {complete ? '√' : index + 1}
              </span>
              <span className="task-copy">
                <strong>{copy.title}</strong>
                {!complete && <small>{copy.description}</small>}
              </span>
              <span className="task-progress" aria-label={`进度 ${getTaskProgressLabel(task)}`}>
                <span aria-hidden="true">{getTaskProgressLabel(task)}</span>
                <strong>+{task.rewardApples}🍎</strong>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
