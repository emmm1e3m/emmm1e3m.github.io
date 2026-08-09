# AI 工作笔记

## 稳定项目边界

- 游戏路径固定为 `/AllForSUXINHAO/TravellingBingo/`；仓库根首页只做入口。
- 当前业务状态为 `GameStateV6`，`schemaVersion: 6`；新导出封套中的 `gameVersion` 为 `0.6.0-demo.1`。
- `localStorage` 单槽缓存是日常主存档，`.bingo` 是自动备份与跨浏览器导入格式。收藏、好友和视频目录是当前版本输入，不复制进存档。
- 标题页有缓存时显示“继续”，并始终提供“全新旅程”“本地存档”。全新旅程或本地导入覆盖缓存前先备份旧档；首次获得新的全站第一或认识新朋友形成关键节点时、距离上次周期备份满三天时、检测到网页更新时也自动请求下载当前档。
- 运行时不抓取 B 站收藏夹或微博页面；BVID、作者、发布时间、海报映射和唱片机内置曲目来自构建期静态目录。

## V6 状态与迁移不变量

应用目录 `AllForSUXINHAO/TravellingBingo/` 下的关键路径：

- `src/domain/game/types.ts`：`GameStateV1`–`GameStateV6`、动作与 effect。
- `src/domain/game/migrateGameStateV1.ts`–`migrateGameStateV5.ts`：逐代迁移；冻结的 V1–V5 schema 不回写新字段。
- `src/app/gameStateSchema.ts`：严格历史 schema 联合与 V6 导出 schema。
- `src/infrastructure/persistence/browserGameCache.ts`：浏览器缓存封套与单槽读写。
- `src/app/App.tsx`：三入口、缓存同步、自动备份、通知、更新检查和守候音频接线。

导入顺序固定为：

1. 按文件原始 payload 校验 SHA-256 摘要。
2. 用对应的严格 V1–V6 schema 解析。
3. 显式迁移至 V6。
4. 规范未来活动使用的平衡配置。
5. 用当前目录协调可安全修复的旧引用。
6. 执行最终语义校验后才进入旅程。

必须保持：

- 迁移不重算 `activeActivity.startedAt`、`endsAt`、`rewardSeed` 或 `rewardPlan`。
- 当前新活动默认 `10_000 ms`；迁移不得改写已经开始活动的绝对结束时间。
- 收藏存档只保存已拥有 ID、首获时间与重复次数，不保存目录总数、全站第一指针或分类解锁数组。
- 好友存档只保存已遇见记录，不保存好友目录总数或图片元数据。
- 当前导入可清除已经不再拥有的苹果钟明信片背景，但不能借协调步骤掩盖非法奖励组合、未知奖励 ID 或被篡改的活动时间。
- 任务板以 `completedAt` 记录最后一项完成时间。全完成板保留到下一次游戏日（陪伴日）推进再刷新；任一任务未完成时，跨游戏日原样继承任务与完成状态。游戏日只由成功领取任一种饼屋活动或完成苹果钟整轮推进。
- `taskBoard.ts` 的 `assignmentRequirements` 同时服务新签发与后续协调：收藏墙任务至少一份有效收藏、重温两份至少两份、分类重看至少一份对应类别；统计前必须与当前目录取交集，未知旧 ID 不能制造可达性。
- `reconcileTaskBoardAvailability` 仅在任务板结构、触发组、进度、key 与一次性记录均可安全验证时工作，只替换未完成且已失去前置条件的槽位。替补由持久 seed/sequence 确定，沿用原 `assignedAt`；完成任务和仍可达任务保留原对象、进度与奖励快照。畸形板原样进入最终校验并被拒绝。
- `prepareStoredGame` 为本地文件与浏览器缓存执行“迁移 → 平衡规范 → 目录/任务协调 → 最终校验”；DEBUG 单项移除收藏与“清空收集”在 reducer 内调用同一协调。任何路径都不能用修复掩盖非法任务板。

V5/V6 相对旧版新增或调整的主要持久字段：

```text
world: game | reality
player.effects.vitality
reality.pomodoro.session.status / focusEndsAt / cycleEndsAt
tasks.completedAt
musicPlayer.currentBvid / currentIndex / loopMode
reality.streamHistory.completedRounds / recentRounds[0..9]
```

V1–V5 迁移到 V6 时初始化空刷播历史。V6 的 `recentRounds` 必须按 `round` 从大到小连续保存，长度为 `min(completedRounds, 10)`；`completedAt` 只保存用于显示的完成回调时间，不参与排序。

当前面板、弹窗焦点、琴键按下状态、奖励弹窗和布局动画仍是 UI 瞬时状态，不写入存档。

## 活动、意愿与魔法

- 活动种类仍为 `travel | stream | trend | music | rest`。开始时签发完整奖励计划，领取成功才让 `companionDays + 1`。
- 苹果钟也是陪伴日来源：专注阶段结束后进入休息阶段，完成整轮时才原子地 `companionDays + 1`。重复 tick、未到点 tick、截止前取消、普通现实停留结算与待办增删改/到期通知都不加天。
- `activity/cancel` 使用当前 `runId`；running 与 ready 都可取消。取消不计一天、不发奖励、不返还已经消耗的补给或幸运苹果。
- 意愿键为 `travel | computer | music`；刷播和冲热共享 `computer`。睡觉不受意愿拒绝。
- 灰色活动入口使用 `aria-disabled` 表达不愿意，但保留点击反馈；没有活力魔法时只显示拒绝，不能进入普通启动确认。
- ⚡瓶装速度魔法价格 2🍎。只允许在当前活动仍为 running 时使用，消耗一瓶并把该活动的 `endsAt` 设为使用时间；已经 ready 时不消耗。
- ✨瓶装活力魔法价格 7🍎。使用后立即把三组意愿设为真、清除疲劳；效果持续七个由“饼屋活动成功领取”或“苹果钟完成专注与休息整轮”推进的相伴日，不是七个自然日。苹果钟推进到第七日时同样清除效果并按偏好序列恢复当日意愿；已有有效效果或所有意愿本就可用时拒绝并不消耗。
- 冰箱共有七种道具，所有条目通过 `ITEM_COPY` 提供 emoji；金额只使用 `N🍎`。

## 奖励与收藏

- 默认概率：明信片 0.65、百万直拍 0.3、全站第一 0.15、旅行遇友 0.1、音乐好友每位已认识朋友 0.15。
- 幸运苹果对当前活动对应的收藏概率做 `×2` 相对乘法并封顶为 1；基础概率为 0 时不允许浪费。
- 旅行先判朋友；命中后签发朋友、固定道具与按身份 2/3/4/3/2🍎，不再判明信片。未命中朋友时才判明信片；已经认识的朋友仍在完整五人候选池中。
- 音乐好友只能从活动开始时已经认识的好友集合中选择，不会解锁新好友；实际来访率为 `min(1, 0.15 × 已认识人数)`，命中后在已认识集合中等概率选取。课代饼/三好兔/心好兔/信号狗/饼哩饼哩分别赠 4/6/8/6/4🍎。默认至多五人时，期望值化简为 `0.15 × 已认识好友礼物总和`，因此每新增一位都严格增加期望；五人全识时为 4.2🍎。
- 已开始活动保存完整 `rewardPlan`。旧音乐 2/3/4/3/2🍎 与正式旧旅行 0🍎 计划继续按快照兑现；新旅行按课代饼、三好兔、心好兔、信号狗、饼哩饼哩依次固化 2/3/4/3/2🍎，绝不在导入时重算。
- 明信片和百万直拍从未拥有集合随机选择；全站第一按 `siteFirstChronology` 第一个未拥有项选择。
- DEBUG 的“一键全收集”和“清空收集”同时处理三类收藏与全部好友；不维护预制全收集存档。
- 收藏详情整体比例为桌面或横屏 16:9、手机竖屏 9:16；卡片缩略图和好友头像可用 `cover`，收藏详情、全屏预览和明信片选择器使用 `contain` 完整展示并允许留白，苹果钟运行背景使用 `cover` 铺满并允许裁切。

## 房间与 UI 锚点

唯一母版：`resources/raw/travelling-bingo/generated/chan-chan-house-master.png`，1098 × 1433 RGBA。应用目录下的公开文件名保留为：

```text
public/assets/game/chan-chan-house-v2-768.webp
public/assets/game/chan-chan-house-v2-1098.webp
```

公开房图只做等比缩放和无损 WebP 编码，不裁切、不重绘；横向房间卡以 `contain` 居中显示实际图片舞台，左右允许透明留白。`roomConfig.ts` 以母版像素保存饼狗中心点：

| 位置         |        中心点 |
| ------------ | ------------: |
| 床上         |  `(225, 300)` |
| 二楼电脑前   |  `(504, 409)` |
| 衣架前       |  `(387, 675)` |
| 电子琴前     | `(257, 1103)` |
| 一楼电脑前   | `(420, 1172)` |
| 冰箱前       |  `(633, 951)` |
| 唱片机前     | `(783, 1030)` |
| 收藏墙前     | `(673, 1053)` |
| 门口         | `(980, 1176)` |
| 默认房间中央 | `(620, 1180)` |

交互合同：

- 空白点击进入 `status` 概览，显示当前任务和三组意愿；不再依赖房屋展开/收缩动画。
- 信息栏内容切换使用 keyed 内容入场；点击房间空白即可回到待机信息。
- 活动中左下 `↩️` 只发起带 token 的取消确认，不能直接清空状态。
- `ℹ️`、`↩️`、`🔃` 都挂在横向房间区域角落；切换前必须先展示介绍并确认。
- 顶栏状态使用纯文字单行完整显示，不用狗 emoji，不放守候音频或更新检查按钮；去掉独立黑边胶囊。
- 网页 favicon、Apple Touch Icon、PWA 普通图标和 maskable 图标均从既有饼狗 idle 帧机械裁切生成。

## 四排电子琴

- `PIANO_NOTE_IDS` 与 `PIANO_NOTES` 由同一份配置生成，覆盖 C3–B6，四个完整八度、48 个半音。
- 界面从上到下为 C6、C5、C4、C3；物理键盘白键依次映射 `1–7`、`Q–U`、`A–J`、`Z–M`。
- 鼠标、触摸和键盘都能触发琴键；黑键没有物理键盘映射。
- Web Audio 使用多谐波和衰减包络模拟钢琴音色，首次交互后才创建或恢复音频上下文。
- 弹琴读条与乐器交互彼此独立；读条进行时仍能演奏。

## 持久 B 站播放器

- `BilibiliPlayerProvider` 持有受控业务状态与单份运行态；`PersistentPlayerDock` 通过 portal 固定挂在 `document.body`，避免被房间、收藏墙或苹果钟模态层切换卸载。
- 每次选曲固定请求 `autoplay=1`，详情打开即请求播放。展开态 iframe 保留鼠标和键盘交互；收起态只在容器上设置 `inert`、`aria-hidden` 和 `pointer-events: none`，不重建唯一 iframe。
- 显示/隐藏不重建 iframe；暂停冻结游戏估算进度并卸载 iframe，继续从估算秒数重建，取消移除请求。
- 状态层只保存当前 BV、索引和列表/单曲/随机模式；当前请求、暂停估算位置和画面展开状态不写入存档。
- 唱片机固定提供八首全站第一（Dynamite 至 POWER），不提供自定义曲库。单曲模式主动上一首、下一首仍移动到相邻曲目，只有游戏计时结束时才重播当前曲目。
- 官方 iframe 没有稳定的父页播放状态接口；当前从 iframe 加载后按静态目录中的 `durationSeconds` 维护游戏计时并尽力续播。用户直接在 iframe 内暂停或拖动时，这份估算不会同步；只有游戏自己的暂停/继续控件能同步该计时。

## 现实生活维度

- `reality/enter` 记录绝对 `enteredAt`；`reality/leave` 计算完整十分钟数并生成 `pendingSettlement`。
- `reality/settle` 中 `serious` 获得全额，`not-serious` 获得 `floor(full / 2)`；未完成十分钟时全额为 0。
- `browserPlatform.ts` 只用 `(hover: hover) and (pointer: fine)` 表达 PC 主输入能力，不用 UA 名单或窗口宽度；进入前与确认时各检查一次。非 PC 恢复 reality 存档时只显示显式返回与结算入口。
- 二楼现实入口拆分为“刷播”和“冲热（开发中）”；冲热页只保留居中的字母建设站入口。一楼“工作”先显示待办，再显示专门的明信片选择器。
- `features/reality/stream/parser.ts` 只本地解析裸 BV 或含单个 BV 的 `bilibili.com` 长链接；拒绝需要联网展开的短链、非 B 站链接和一行多个 BV，不调用 API 或跨域代理。
- `useStreamPlayback.ts` 只用顶层 `window.open` 打开标准视频页。弹窗模式同步开完，新标签模式在每次成功打开后延迟 8 秒；最后一个页面实际打开后签发一次当前轮时长的 `setTimeout`。
- 后台冻结可能延迟回调；页面恢复后最多推进当前轮，不补开多轮。`focus` / `pageshow` / `visibilitychange` 负责恢复时协调；弹窗拦截不记历史，停止/卸载会清理定时器并关闭已持有窗口。
- `Date.now()` 只在完成回调中写入用于显示的 `completedAt`。reducer 按递增 `round` 前插并截取 10 条，历史顺序不依赖完成时间。
- 默认刷播轮次为 310 秒。DEBUG 通过页面运行态向 `useStreamPlayback({ roundDurationMs })` 提供 1–3600 秒覆盖值；当前轮在开始时快照时长，修改只影响下一轮或重新开始，且不写入存档。
- 苹果钟预设为 25+5、50+10、90+15 分钟。全屏层锁定启动时的明信片并以 `cover` 铺满背景、允许裁切，与可操作的游戏播放器控件、待办和饼狗共同组成焦点 UI。
- `clock/tick` 按绝对时间切换 focus → break → completed，并签发稳定 `notificationId` 的 effect；只在 completed 时推进陪伴日。

## 浏览器能力边界

- 通知权限只能在用户点击后请求。当前实现使用页面计时器并在 `focus` / `visibilitychange` 时补检查；页面完全关闭、系统休眠或浏览器冻结时不能保证准点系统通知。
- “检查更新”调用当前 Service Worker registration 的 `update()`。无 Service Worker、未注册或网络失败时显示对应状态；检查本身不强制安装更新。
- `needRefresh` 首次表明检测到新版本时自动下载当前缓存档；随后安装该版本前再次调用同一幂等备份入口，避免无备份刷新。
- 周期备份以 `lastPeriodicBackupRequestedAt ?? firstCachedAt` 为基准判断三天间隔；成功请求后写回 `lastPeriodicBackupRequestedAt`，避免重复下载。
- `prepareBrowserCache` 只要 payload 迁移/规范/协调成新对象或 `gameVersion` 过旧，就用 `updateBrowserGameCache` 同步 V6 payload、`0.6.0-demo.1` 与 `updatedAt`；保留 `saveId`、`firstCachedAt`、`lastPeriodicBackupRequestedAt` 和外层 `cacheVersion: 1`。
- 守候音频只在三个旅程入口的明确用户手势中创建并复用，运行期保持开启；状态栏不显示开关。它不能绕过浏览器或操作系统的后台冻结策略。
- GitHub Pages 是静态托管，浏览器不能伪造 B 站 Referer；B 站 API、DASH/MP4 流也不向当前 Pages Origin 提供可直接播放的跨域响应。因此不固化会过期的签名流地址，也不引入未知第三方代理，继续使用官方 iframe。
- 现实刷播与收藏/唱片机播放器是两条独立边界：前者直接打开标准 B 站顶层页面且不读取页面内容，后者继续使用官方 iframe；两者都不使用跨域代理或运行时 B 站 API。
- 两个微博头像原链接是带到期签名的外链，发布资源已下载到 `public/assets/links/` 并加入 Workbox 预缓存；第二个目标采用实际 href 与已有来源账号一致的 UID `7760819929`。
- 两款公开 WOFF2 使用《现代汉语常用字表》1988 年版的 2500 个“常用字”作为稳定底集，再合并 ASCII、中文标点和当前运行时表外用字。固定表由两份公开转录逐字同序交叉核对，构建/校验离线完成；校验会直接读取 WOFF2 的 cmap，确认当前必须字符实际存在，不再用文件哈希代替字形覆盖检查。

## 关键目录与验证入口

```text
AllForSUXINHAO/TravellingBingo/src/domain/             # 领域、迁移、现实与播放器持久状态
AllForSUXINHAO/TravellingBingo/src/app/                # 应用接线、导入导出、通知、更新
AllForSUXINHAO/TravellingBingo/src/features/game/      # 房间、信息栏、HUD、设施
AllForSUXINHAO/TravellingBingo/src/features/player/    # 持久播放器、固定曲库与游戏控件
AllForSUXINHAO/TravellingBingo/src/features/reality/   # 刷播、冲热占位、苹果钟与待办 UI
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

`npm run verify` 不包含 Playwright；浏览器 E2E 必须单独执行。测试播放器时只能断言请求 URL、iframe 生命周期、任务事件和持久状态，不能断言跨域 iframe 的真实播放状态。现实刷播 E2E 应拦截标准视频页，验证两种开页方式、310 秒单次定时、冻结恢复当前轮、DEBUG 下一轮时长覆盖、停止清理、无代理/API 请求与 V6 最近 10 轮历史。
