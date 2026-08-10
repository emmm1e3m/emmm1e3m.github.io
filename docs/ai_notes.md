# AI 工作笔记

## 稳定项目边界

- 游戏路径固定为 `/AllForSUXINHAO/TravellingBingo/`；仓库根首页只做入口。
- 当前业务状态为 `GameStateV9`，`schemaVersion: 9`；新导出封套中的 `gameVersion` 为 `0.9.0-demo.1`。
- `localStorage` 单槽缓存是日常主存档，`.bingo` 是自动备份与跨浏览器导入格式。收藏、好友和视频目录是当前版本输入，不复制进存档。
- 标题页有缓存时显示“继续”，并始终提供“全新旅程”“本地存档”。全新旅程或本地导入覆盖缓存前先备份旧档；首次获得新的全站第一或认识新朋友形成关键节点时、距离上次周期备份满三天时、检测到网页更新时也自动请求下载当前档。
- 运行时不抓取 B 站收藏夹或微博页面；BVID、作者、发布时间、海报映射、唱片机内置曲目，以及刷播收藏夹 `3963921644` 的全部可见视频集合都来自构建期静态目录。刷播运行时只在该同源集合内按轮随机排列；仅显式运行 `npm run research:sync:bilibili` 时联网刷新目录。

## V9 状态与迁移不变量

应用目录 `AllForSUXINHAO/TravellingBingo/` 下的关键路径：

- `src/domain/game/types.ts`：`GameStateV1`–`GameStateV9`、动作与 effect。
- `src/domain/game/migrateGameStateV1.ts`–`migrateGameStateV8.ts`：逐代迁移；冻结的 V1–V8 schema 不回写新字段。
- `src/app/gameStateSchema.ts`：严格历史 schema 联合与 V9 导出 schema。
- `src/infrastructure/persistence/browserGameCache.ts`：浏览器缓存封套与单槽读写。
- `src/app/App.tsx`：三入口、缓存同步、自动备份、通知、更新检查和守候音频接线。

导入顺序固定为：

1. 按文件原始 payload 校验 SHA-256 摘要。
2. 用对应的严格 V1–V9 schema 解析。
3. 显式迁移至 V9。
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
- 新任务模板的 `rewardApples` 上限为 3；已经签发的历史 `TaskInstance.rewardApples` 是奖励快照，不因模板上限调整而被迁移重算。
- `taskBoard.ts` 的 `assignmentRequirements` 同时服务新签发与后续协调：收藏墙任务至少一份有效收藏、重温两份至少两份、分类重看至少一份对应类别；统计前必须与当前目录取交集，未知旧 ID 不能制造可达性。
- `reconcileTaskBoardAvailability` 仅在任务板结构、触发组、进度、key 与一次性记录均可安全验证时工作，只替换未完成且已失去前置条件的槽位。替补由持久 seed/sequence 确定，沿用原 `assignedAt`；完成任务和仍可达任务保留原对象、进度与奖励快照。畸形板原样进入最终校验并被拒绝。
- `prepareStoredGame` 为本地文件与浏览器缓存执行“迁移 → 平衡规范 → 目录/任务协调 → 最终校验”；DEBUG 单项移除收藏与“清空收集”在 reducer 内调用同一协调。任何路径都不能用修复掩盖非法任务板。

V5–V9 相对旧版新增或调整的主要持久字段：

```text
world: game | reality
player.effects.vitality
reality.pomodoro.session.status / focusEndsAt / cycleEndsAt
tasks.completedAt
musicPlayer.currentBvid / currentIndex / loopMode
reality.streamHistory.completedRounds / recentSessions[0..9]
reality.streamSettings.selfTestBvid / dimensionPenetrationEnabled
reality.activeStay.activeDurationMs / leaseStartedAt
```

V1–V5 先迁到 V6 并初始化空刷播历史，再迁到 V7。历史 V6→V7 迁移会把每条 `recentRounds` 独立转为一条 `legacy-round-*` 会话，不按时间阈值猜测合并；V7→V8 只初始化刷播设置。V8→V9 为现实停留增加可暂停租约；旧 V8 活跃停留因没有心跳证据而从 0 开始累计，不使用缓存更新时间推断在线时长。当前每轮 progress 只增加累计轮次；session end 才追加最近任务，重复的完全相同 end 幂等，冲突内容拒绝。

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
- `addNonStackingBaseProbabilityBonus(base, ...rates)` 只取同类最高加成比例，并计算 `min(1, base + base × maxRate)`。🍎苹果旅行便当只对未增强的 `travelFriend` 基础概率增加 100%，默认 0.1 → 0.2；🍀幸运苹果只对当前活动对应的未增强收藏概率增加 100%，不改变遇友概率。两者分别作用于自己的目标概率，不能在已经增强后的结果上继续复合翻倍；收藏基础概率为 0 时不允许浪费幸运苹果。
- 旅行先判朋友；命中后签发朋友、固定道具与按身份 2/3/4/3/2🍎，不再判明信片。未命中朋友时才判明信片；已经认识的朋友仍在完整五人候选池中。
- 音乐好友只能从活动开始时已经认识的好友集合中选择，不会解锁新好友；实际来访率为 `min(1, 0.15 × 已认识人数)`，命中后在已认识集合中等概率选取。课代饼/三好兔/心好兔/信号狗/饼哩饼哩分别赠 4/6/8/6/4🍎。默认至多五人时，期望值化简为 `0.15 × 已认识好友礼物总和`，因此每新增一位都严格增加期望；五人全识时为 4.2🍎。
- 已开始活动保存完整 `rewardPlan`。旧音乐 2/3/4/3/2🍎 与正式旧旅行 0🍎 计划继续按快照兑现；新旅行按课代饼、三好兔、心好兔、信号狗、饼哩饼哩依次固化 2/3/4/3/2🍎，绝不在导入时重算。
- 明信片和百万直拍从未拥有集合随机选择；全站第一按 `siteFirstChronology` 第一个未拥有项选择。
- DEBUG 的“一键全收集”和“清空收集”同时处理三类收藏与全部好友；不维护预制全收集存档。
- 收藏墙总标题与已解锁分类显示 `owned/?`；当且仅当该动态目录全部拥有时改为 `owned/total`。分母从当前 `catalog.items` / `catalog.friends` 派生，存档仍不保存总数。
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
- 顶栏把导航入口放在左组、运行状态和资源入口放在右组，自适应收缩且不相互覆盖。现实分钟、游客轮次/倒计时、活力、🍎、收藏墙和 DEBUG 均为可点击按钮；现实分钟执行返回游戏维度，活力执行点击饼狗。旧“状态正常”不再派生或显示。
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

- `reality/enter` 创建 `activeDurationMs: 0` 的页面租约；每 60 秒心跳把当前租约增量同步进缓存。点 HUD“离开”和 `pagehide` 立即暂停租约，载入/继续只重设租约起点，不把离线间隔加入累计值；异常退出最多保留到最后一次已写入心跳。
- `reality/leave` 只按 `activeDurationMs` 与当前仍有效的租约尾段计算完整十分钟数；不足 1🍎时直接回到游戏维度，不创建 `pendingSettlement`。
- `reality/settle` 中 `serious` 获得全额，`not-serious` 获得 `floor(full / 2)`；未完成十分钟时全额为 0。
- `browserPlatform.ts` 只用 `(hover: hover) and (pointer: fine)` 表达 PC 主输入能力，不用 UA 名单或窗口宽度；进入前与确认时各检查一次。非 PC 恢复 reality 存档时只显示显式返回与结算入口。
- 二楼现实入口拆分为“刷播”和“冲热（开发中）”；冲热页只保留居中的字母建设站入口。一楼“工作”先显示待办，再显示专门的明信片选择器。
- `features/reality/stream/parser.ts` 接受单个可选裸 BVID 或 `http(s)` B 站完整视频链接，规范为 BVID 后写入 `reality.streamSettings`；留空时仅使用静态刷播目录。主列表由 `fid=3963921644` 在构建期同步到同源 `data/video-catalog.json`，运行时不访问收藏夹 API 或跨域代理。
- 登录刷播由 `useStreamPlayback.ts` 通过顶层 `window.open` 打开标准视频页；实验性维度穿透游客刷播由 `useVisitorStreamPlayback.ts` 调度不可交互的官方播放器 iframe。两者互斥，并都不因游戏/现实维度切换而重建；维度穿透开关开启且没有登录刷播时才自动启动游客刷播。
- 每轮通过注入的随机源重排去重后的静态目录，自测 BVID 从静态集合去重后始终追加在末尾。两种方式共享页面会话视频间隔与轮次间隔。登录刷播的弹窗和标签按快照间隔依次打开；游客刷播逐个追加 iframe，最后一个 iframe 创建后保留整轮，轮次截止时统一清空并创建下一轮。游客 HUD 跨维度显示当前轮次，并通过 `performance.now()` 时间域内的 `getNextRoundRemainingMs()` 派生下一轮倒计时，不能把该 deadline 与 `Date.now()` 混算。
- 会话可快照 0–24 小时的定时停止，0/null 为不限时。打开步骤、轮次截止和会话截止共用一个一次性 timer；后台恢复最多推进当前到期步骤，不补开多轮。`focus` / `pageshow` / `visibilitychange` 负责恢复协调；停止/卸载会清理 timer 和窗口。
- 每轮完成派发 `reality/stream-session-progress`，只增加累计轮次；主动停止或限时完成派发一次 `reality/stream-session-end`，把 session 起止、总轮数与结果作为最近 10 次任务中的一条。0 轮也记录；运行参数不持久化。
- 默认刷播轮次为 310 秒。DEBUG 通过页面运行态向 `useStreamPlayback({ roundDurationMs })` 提供 1–3600 秒覆盖值；当前轮在开始时快照时长，修改只影响下一轮或重新开始，且不写入存档。
- 苹果钟预设为 25+5、50+10、90+15 分钟。全屏层锁定启动时的明信片并以 `cover` 铺满背景、允许裁切，与可操作的游戏播放器控件、待办和饼狗共同组成焦点 UI。
- `clock/tick` 按绝对时间切换 focus → break → completed，并签发稳定 `notificationId` 的 effect；只在 completed 时推进陪伴日。

## 浏览器能力边界

- 通知权限只能在用户点击后请求。当前实现使用页面计时器并在 `focus` / `visibilitychange` 时补检查；页面完全关闭、系统休眠或浏览器冻结时不能保证准点系统通知。
- 首次进入或从旅程返回标题页时自动调用一次“检查更新”；同一次标题页停留以 ref 去重，目录、缓存、提示等重绘不会再次触发，玩家仍可用按钮手动再查。自动与手动检查共用当前 Service Worker registration 的 `update()`、状态和提示流程。无 Service Worker、未注册或网络失败时沿用对应状态；检查本身不强制安装更新。
- `needRefresh` 首次表明检测到新版本时自动下载当前缓存档；随后安装该版本前再次调用同一幂等备份入口，避免无备份刷新。
- 周期备份以 `lastPeriodicBackupRequestedAt ?? firstCachedAt` 为基准判断三天间隔；成功请求后写回 `lastPeriodicBackupRequestedAt`，避免重复下载。
- `prepareBrowserCache` 只要 payload 迁移/规范/协调/暂停旧页面租约后形成新对象或 `gameVersion` 过旧，就用 `updateBrowserGameCache` 同步 V9 payload、`0.9.0-demo.1` 与 `updatedAt`；保留 `saveId`、`firstCachedAt`、`lastPeriodicBackupRequestedAt` 和外层 `cacheVersion: 1`。
- 守候音频只在三个旅程入口的明确用户手势中创建并复用，运行期保持开启；状态栏不显示开关。它不能绕过浏览器或操作系统的后台冻结策略。
- `useScreenWakeLock.ts` 只在移动主输入媒体查询匹配、旅程运行且页面可见时请求屏幕常亮；隐藏时释放、重新可见时再请求。API 缺失或权限拒绝静默降级，不把常亮请求解释为后台调度保证。
- GitHub Pages 是静态托管，浏览器不能伪造 B 站 Referer；B 站 API、DASH/MP4 流也不向当前 Pages Origin 提供可直接播放的跨域响应。因此不固化会过期的签名流地址，也不引入未知第三方代理，继续使用官方 iframe。
- 现实刷播与收藏/唱片机播放器是两条独立边界：登录刷播直接打开标准 B 站顶层页面，游客刷播和收藏/唱片机使用官方 iframe；父页均不读取跨站内容，也不使用跨域代理或运行时收藏夹 API。
- “游客刷播”是产品模式名，不是匿名保证。游客 iframe 没有设置 `credentialless`，也没有用 `sandbox` 剥离自身来源；其文档运行在 B 站来源下，浏览器按自身第三方 Cookie 策略决定是否把现有 B 站会话附到 B 站请求。`allow="autoplay"` 只委托自动播放能力，`referrerPolicy` 只约束 Referer，不控制 Cookie。GitHub Pages 父页受同源策略限制，不能读取 iframe 的 Cookie、DOM、播放器状态或响应；B 站脚本自己的媒体、历史或心跳请求不表示父页实现了跨域访问。父页只控制 URL、创建顺序、计时和移除；轮次截止时清空本轮所有 iframe，浏览器随文档销毁停止其后续活动。
- 游客刷播的 iframe 生命周期、HUD 轮次和倒计时只证明本地调度发生，不能证明真实播放、播完或计数增加。
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

`npm run verify` 不包含 Playwright；浏览器 E2E 必须单独执行。测试播放器时只能断言请求 URL、iframe 生命周期、任务事件和持久状态，不能断言跨域 iframe 的真实播放状态。现实刷播测试应覆盖裸 BVID/完整链接规范化与持久化、构建期静态列表、每轮随机且自测末尾、登录/游客互斥、共享间隔、游客整轮 iframe 生命周期、跨维度 HUD 轮次/倒计时、310 秒轮次、任务定时停止、停止清理、无代理/运行时收藏夹 API 请求与 V9 最近 10 次任务历史；不得把 iframe `load`、本地轮次或窗口成功创建解释为 B 站真实播放或计数。
