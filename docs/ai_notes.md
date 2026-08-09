# AI 工作笔记

## 稳定项目边界

- 游戏路径固定为 `/AllForSUXINHAO/TravellingBingo/`；仓库根首页只做入口。
- 当前业务状态为 `GameStateV4`，`schemaVersion: 4`；新导出封套中的 `gameVersion` 为 `0.4.0-demo.1`。
- `.bingo` 是权威用户存档，PWA 缓存不是存档。收藏、好友和视频目录是当前版本输入，不复制进存档。
- 运行时不抓取 B 站收藏夹或微博页面；BVID、作者、发布时间、海报映射和唱片机内置曲目来自构建期静态目录。

## V4 状态与迁移不变量

应用目录 `AllForSUXINHAO/TravellingBingo/` 下的关键路径：

- `src/domain/game/types.ts`：`GameStateV1`–`GameStateV4`、动作与 effect。
- `src/domain/game/migrateGameStateV1.ts`、`migrateGameStateV2.ts`、`migrateGameStateV3.ts`：逐代迁移。
- `src/app/gameStateSchema.ts`：严格历史 schema 联合与 V4 导出 schema。
- `src/app/App.tsx`：导入顺序、PWA 保存保护、通知、更新检查和守候音频接线。

导入顺序固定为：

1. 按文件原始 payload 校验 SHA-256 摘要。
2. 用对应的严格 V1、V2、V3 或 V4 schema 解析。
3. 显式迁移至 V4。
4. 规范未来活动使用的平衡配置。
5. 用当前目录协调可安全修复的旧引用。
6. 执行最终语义校验后才进入旅程。

必须保持：

- 迁移不重算 `activeActivity.startedAt`、`endsAt`、`rewardSeed` 或 `rewardPlan`。
- 新 V4 活动默认 `72_000 ms`；`112_000 ms` 只作为 V2/V3 历史默认和旧档兼容常量保留。
- 收藏存档只保存已拥有 ID、首获时间与重复次数，不保存目录总数、全站第一指针或分类解锁数组。
- 好友存档只保存已遇见记录，不保存好友目录总数或图片元数据。
- V4 导入可清除已经不再拥有的苹果钟明信片背景，但不能借协调步骤掩盖非法奖励组合、未知奖励 ID 或被篡改的活动时间。
- V4 任务板不再签发 `greet-bingo`；旧板迁移时用当前任务规则替换退役任务，并只推进任务随机序列。

`GameStateV4` 新增的持久字段：

```text
world: game | reality
player.effects.vitality
reality.activeStay / pendingSettlement / todos / pomodoro
musicPlayer.playlists / order / activePlaylistId / currentBvid
musicPlayer.currentIndex / loopMode / startAtSeconds / autoplay
```

当前面板、弹窗焦点、琴键按下状态、奖励弹窗和布局动画仍是 UI 瞬时状态，不写入存档。

## 活动、意愿与魔法

- 活动种类仍为 `travel | stream | trend | music | rest`。开始时签发完整奖励计划，领取成功才让 `companionDays + 1`。
- 苹果钟也是陪伴日来源：运行中的 session 首次在 `clock/tick` 或截止后的取消请求中被权威完成时，`companionDays + 1`。同一已完成 session 的重复 tick、未到点 tick、截止前取消、普通现实停留结算与待办增删改/到期通知都不加天。
- `activity/cancel` 使用当前 `runId`；running 与 ready 都可取消。取消不计一天、不发奖励、不返还已经消耗的补给或幸运苹果。
- 意愿键为 `travel | computer | music`；刷播和冲热共享 `computer`。睡觉不受意愿拒绝。
- 灰色活动入口使用 `aria-disabled` 表达不愿意，但保留点击反馈；没有活力魔法时只显示拒绝，不能进入普通启动确认。
- ⚡瓶装速度魔法价格 8🍎。只允许在当前活动仍为 running 时使用，消耗一瓶并把该活动的 `endsAt` 设为使用时间；已经 ready 时不消耗。
- ✨瓶装活力魔法价格 12🍎。使用后立即把三组意愿设为真、清除疲劳；效果持续七个由“饼屋活动成功领取”或“苹果钟首次到点完成”推进的相伴日，不是七个自然日。苹果钟推进到第七日时同样清除效果并按偏好序列恢复当日意愿；已有有效效果或所有意愿本就可用时拒绝并不消耗。
- 冰箱共有七种道具，所有条目通过 `ITEM_COPY` 提供 emoji；金额只使用 `N🍎`。

## 奖励与收藏

- 默认概率：明信片 0.65、百万直拍 0.4、全站第一 0.1、旅行遇友 0.2、音乐好友 0.2。
- 旅行先判朋友；命中后只签发朋友与固定道具，不再判明信片。没有朋友时才判明信片。
- 音乐好友只能从活动开始时已经认识的好友集合中选择，不会解锁新好友；固定赠送 2–4🍎。
- 明信片和百万直拍从未拥有集合随机选择；全站第一按 `siteFirstChronology` 第一个未拥有项选择。
- DEBUG 的“一键全收集”和“一键撤销全部收集”同时处理三类收藏与全部好友；不维护预制全收集存档。
- 收藏详情整体比例为桌面或横屏 16:9、手机竖屏 9:16；卡片和详情预览使用 `cover`，点击图片后用 `contain` 完整展示并提供下载。

## 房间与 UI 锚点

唯一母版：`resources/raw/travelling-bingo/generated/chan-chan-house-master.png`，1098 × 1433 RGBA。应用目录下的公开文件名保留为：

```text
public/assets/game/chan-chan-house-v2-768.webp
public/assets/game/chan-chan-house-v2-1098.webp
```

公开房图只做等比缩放和无损 WebP 编码，不裁切、不重绘。`roomConfig.ts` 以母版像素保存饼狗中心点：

| 位置         |        中心点 |
| ------------ | ------------: |
| 床上         |  `(225, 300)` |
| 二楼电脑前   |  `(504, 409)` |
| 衣架前       |  `(387, 675)` |
| 电子琴前     | `(257, 1103)` |
| 一楼电脑前   | `(420, 1172)` |
| 冰箱前       |  `(633, 951)` |
| 唱片机前     | `(783, 1030)` |
| 收藏墙前     | `(1053, 673)` |
| 门口         | `(980, 1176)` |
| 默认房间中央 | `(620, 1180)` |

交互合同：

- 空白点击进入 `status` 概览，显示当前任务和三组意愿；不再依赖房屋展开/收缩动画。
- 信息栏内容切换使用 keyed 内容入场；信息栏本身不做展开/收起布局动画。
- 信息栏顶行左侧是当前语境标签，右侧是“收起信息栏”；活动进度标签使用“这一次 Bingo”。
- 活动中左下 `↩️` 只发起带 token 的取消确认，不能直接清空状态。
- 右上 `ℹ️` 打开简洁说明，角标精确为“铲铲饼屋的小纸条”；它不扩写为长篇的设施与价格手册，详细价格只留在冰箱。右下按钮切换游戏/现实维度。
- 顶栏中心固定单行“今天也要好好吃苹果”；右侧状态区显示饼狗当前活动/活力、守候音频与检查新布置。
- 网页 favicon、Apple Touch Icon、PWA 普通图标和 maskable 图标均从既有饼狗 idle 帧机械裁切生成。

## 三排电子琴

- `PIANO_NOTE_IDS` 与 `PIANO_NOTES` 覆盖 C4–B6，三个完整八度、36 个半音。
- 界面分三排；中间一排从 C5 开始。物理键盘只映射白键：C4 排 `Z–M`、C5 排 `A–J`、C6 排 `Q–U`。
- 鼠标、触摸和键盘都能触发琴键；黑键没有物理键盘映射。
- Web Audio 使用多谐波和衰减包络模拟钢琴音色，首次交互后才创建或恢复音频上下文。
- 弹琴读条与乐器交互彼此独立；读条进行时仍能演奏。

## 持久 B 站播放器

- `BilibiliPlayerProvider` 在 `GameHome` 外层持有唯一生产 iframe；信息栏和收藏详情只发送播放请求。
- 每次选曲固定请求 `autoplay=1`，详情打开即请求播放。收起信息栏或切换维度不卸载 iframe；“停止并关闭”才移除当前请求。
- 状态层保存当前 BV、用户播放列表、列表顺序、主动设置的起播秒数和列表/单曲/随机模式。
- 唱片机信息栏已挂载 `BilibiliPlaylistPanel`：可在内置“百万直拍精选”和已保存曲库间切换；从内置曲库提交时创建并选中新列表，从自定义曲库提交时更新现有列表。
- `parseBilibiliPlaylistInput` 接受逐行 BV 号或完整 Bilibili 视频链接，拒绝无 BV 的短链接并去重；名称、BV 列表、选择与播放设置通过领域动作持久化。
- B 站 iframe 跨域；父页面不能可靠读取暂停、真实进度、结束或实际自动播放结果。因此：
  - 任务事件只代表用户请求打开播放器；
  - 起播秒数只是 URL 请求，不是父页面可校准的进度条；
  - 播放模式只决定玩家主动上一首/下一首时的选曲；
  - 不伪造视频结束后的自动续播。

## 现实生活维度

- `reality/enter` 记录绝对 `enteredAt`；`reality/leave` 计算完整十分钟数并生成 `pendingSettlement`。
- `reality/settle` 中 `serious` 获得全额，`not-serious` 获得 `floor(full / 2)`；未完成十分钟时全额为 0。
- 二楼“数据”页显示刷播、冲热的精确入口说明、待开发操作步骤和运行组链接 `https://www.weibo.com/u/7878664767`。
- 一楼“工作”页提供 5、25、50 分钟苹果钟、已解锁明信片背景与待办 CRUD。待办、背景、绝对结束时间和通知签发标记都持久化。
- `clock/tick` 按绝对时间完成苹果钟和到期待办，并签发稳定 `notificationId` 的 effect。只有首次完成到点苹果钟会原子推进一天陪伴天数与活力状态；单独的待办到期不推进。App 只在已有权限时调用 `Notification`；否则使用页内提示。

## 浏览器能力边界

- 通知权限只能在用户点击后请求。当前实现使用页面计时器并在 `focus` / `visibilitychange` 时补检查；页面完全关闭、系统休眠或浏览器冻结时不能保证准点系统通知。
- “检查新布置”调用当前 Service Worker registration 的 `update()`。无 Service Worker、未注册或网络失败时显示对应状态；检查本身不强制安装更新。
- 10 Hz、gain 0.01 的守候音频只在开始或确认导入旅程的用户手势中创建，App 生命周期内复用；关闭时将增益归零并 suspend。它不能绕过浏览器或操作系统的后台冻结策略。
- 有声自动播放由第三方 iframe 与浏览器策略共同决定。代码只能发请求并提供来源页回退，不能承诺声音一定开始。

## 关键目录与验证入口

```text
AllForSUXINHAO/TravellingBingo/src/domain/             # 领域、迁移、现实与播放器持久状态
AllForSUXINHAO/TravellingBingo/src/app/                # 应用接线、导入导出、通知、更新
AllForSUXINHAO/TravellingBingo/src/features/game/      # 房间、信息栏、HUD、设施
AllForSUXINHAO/TravellingBingo/src/features/player/    # 持久播放器与列表解析
AllForSUXINHAO/TravellingBingo/src/features/reality/   # 数据、苹果钟与待办 UI
AllForSUXINHAO/TravellingBingo/src/features/album/     # 收藏与详情
resources/raw/travelling-bingo/                        # 授权原图、生成母版和字体源
scripts/                                               # 素材、目录、站点与验证脚本
```

完整验证顺序：

```powershell
npm run verify
npm run build
npm run site:assemble
npm run site:verify
npm run test:e2e
```

`npm run verify` 不包含 Playwright；浏览器 E2E 必须单独执行。测试播放器时只能断言请求 URL、iframe 生命周期、任务事件和持久状态，不能断言跨域 iframe 的真实播放状态。
