# AI 工作笔记

## 稳定项目边界

- 游戏路径固定为 `/AllForSUXINHAO/TravellingBingo/`；仓库根首页只做入口。
- 当前产品显示版本为 `v0.10.1`；业务状态为 `GameStateV12`、`schemaVersion: 12`，新导出封套中的 `gameVersion` 为 `0.10.1`。
- `localStorage` 单槽缓存是日常主存档，`.bingo` 是自动备份与跨浏览器导入格式。收藏、好友和视频目录是当前版本输入，不复制进存档。
- 标题页有缓存时显示“继续”，并始终提供“全新旅程”“本地存档”。全新旅程或本地导入覆盖缓存前先备份旧档；首次获得新的全站第一或认识新朋友形成关键节点时、距离上次周期备份满三天时、检测到网页更新时也自动请求下载当前档。
- 运行时不抓取 B 站收藏夹或微博页面；BVID、作者、发布时间、海报映射与唱片机内置曲目来自构建期静态目录。刷播的唯一运行源是应用目录中的 `favourites/3682220021.txt` 与 `favourites/3986840044.txt`，构建时原样复制到同源发布路径；仅显式运行 `npm run research:sync:favourites` 才联网刷新这两份文本。旧视频目录中的 streaming 字段不再属于当前目录 schema、同步或运行链路。

## V12 状态与迁移不变量

应用目录 `AllForSUXINHAO/TravellingBingo/` 下的关键路径：

- `src/domain/game/types.ts`：`GameStateV1`–`GameStateV12`、动作与 effect。
- `src/domain/game/migrateGameStateV1.ts`–`migrateGameStateV11.ts`：逐代迁移；冻结的 V1–V11 schema 不回写新字段。
- `src/app/gameStateSchema.ts`：严格 V1–V12 导入联合与 V12 导出 schema。
- `src/infrastructure/persistence/browserGameCache.ts`：浏览器缓存封套与单槽读写。
- `src/app/App.tsx`：三入口、缓存同步、自动备份、通知、更新检查和守候音频接线。

导入顺序固定为：

1. 按文件原始 payload 校验 SHA-256 摘要。
2. 用对应的严格 V1–V12 schema 解析。
3. 显式迁移至 V12。
4. 规范未来活动使用的平衡配置。
5. 用当前目录协调可安全修复的旧引用。
6. 执行最终语义校验后才进入旅程。

必须保持：

- 迁移不重算 `activeActivity.startedAt`、`endsAt` 或 `rewardSeed`。奖励计划通常也保留；唯一例外是 V10→V11 会把仍在进行或已完成待领取的睡觉 `rewardPlan.baseApples` 强制改为 `0`。
- 当前新活动默认 `10_000 ms`；迁移不得改写已经开始活动的绝对结束时间。
- 收藏存档只保存已拥有 ID、首获时间与重复次数，不保存目录总数、全站第一指针或分类解锁数组。
- 好友存档只保存已遇见记录，不保存好友目录总数或图片元数据。
- 目录协调只清除已经不再拥有或不再可用的苹果钟明信片引用，并把历史合拍中失效的明信片背景置空；从相册正常删除合拍时，领域操作会同时清除苹果钟所选背景和进行中会话对该合拍的引用。严格 V12 存档若直接携带悬空的 `wardrobe-photo` 引用，会在协调前被拒绝，不承诺自动修复；非法奖励组合、未知奖励 ID 或被篡改的活动时间同样不得借协调步骤掩盖。
- 任务板以 `completedAt` 记录最后一项完成时间。全完成板保留到下一次游戏日（陪伴日）推进再刷新；任一任务未完成时，跨游戏日原样继承任务与完成状态。游戏日只由成功领取任一种饼屋活动或完成苹果钟整轮推进。
- 新任务模板的 `rewardApples` 上限为 3；已经签发的历史 `TaskInstance.rewardApples` 是奖励快照，不因模板上限调整而被迁移重算。
- `taskBoard.ts` 的 `assignmentRequirements` 同时服务新签发与后续协调：收藏墙任务至少一份有效收藏、重温两份至少两份、分类重看至少一份对应类别；统计前必须与当前目录取交集，未知旧 ID 不能制造可达性。
- `reconcileTaskBoardAvailability` 仅在任务板结构、触发组、进度、key 与一次性记录均可安全验证时工作，只替换未完成且已失去前置条件的槽位。替补由持久 seed/sequence 确定，沿用原 `assignedAt`；完成任务和仍可达任务保留原对象、进度与奖励快照。畸形板原样进入最终校验并被拒绝。
- `prepareStoredGame` 为本地文件与浏览器缓存执行“迁移 → 平衡规范 → 目录/任务协调 → 最终校验”；DEBUG 单项移除收藏与“清空收集”在 reducer 内调用同一协调。任何路径都不能用修复掩盖非法任务板。

V5–V12 相对旧版新增或调整的主要持久字段：

```text
world: game | reality
player.effects.vitality
reality.pomodoro.session.status / focusEndsAt / cycleEndsAt
reality.pomodoro.selectedBackground / session.background  # postcard | wardrobe-photo
tasks.completedAt
musicPlayer.currentBvid / currentIndex / loopMode
reality.streamHistory.completedRounds / recentSessions[0..9]  # 冻结兼容，只读
reality.streamSettings.selfTestBvid / favoriteId
reality.activeStay.activeDurationMs / leaseStartedAt
reality.streamDailyReward.lastRewardDateKey
wardrobe.layoutVersion / shop / ownedAssetIds / looks / photos
wardrobe looks/photos: x / y / scaleX / scaleY / rotation / z
wardrobe.photos[*].decorations
```

历史 V6→V7 的刷播轮次转换、V7→V8 的旧设置初始化只服务冻结旧档解析；V12 仍保留这份兼容数据，但运行时不再接收或写入新的轮次/会话。V8→V9 增加现实停留租约，V9→V10 保留自测 BVID 并选择默认收藏夹。V10 已冻结为迁移历史；V10→V11 根据持久种子与 `companionDays` 初始化衣柜、从日初未拥有池生成的最多三件商品和空合拍相册，并把尚未领取的旧睡觉 `rewardPlan.baseApples` 归零；除此之外不重算旧活动、收藏、好友、旧刷播统计或现实时长。V11 同样冻结；显式 V11→V12 把所有旧 `scale` 复制为相等的 `scaleX/scaleY`、把衣柜布局升到 2、为旧照片补 `decorations: []`，把旧苹果钟明信片 ID 映射为 `{ kind: 'postcard', id }` 背景引用，并初始化 `streamDailyReward.lastRewardDateKey: null`，不补发奖励。

当前面板、弹窗焦点、琴键按下状态、奖励弹窗和布局动画仍是 UI 瞬时状态，不写入存档。

## 奇迹饼狗

- `wardrobe.shop.companionDay` 必须等于 `profile.companionDays`；每个游戏日从日初未拥有的可售资产池确定性生成 `min(3, remaining)` 个互异商品。未拥有池不少于 3 件时为 3 件，不足时全取，全收集时为空。持久 `shop.assetIds` 长度为 0–3，严格导入按本日已购买商品仍可追溯到日初抽取结果来校验。衣架信息菜单只渲染当日商品中尚未拥有的条目，使用真实透明缩略图，并复用冰箱的购买卡片、金额、余额不足和禁用态；购买成功后条目立即消失，但当日不补入新商品。系统日期变化、失败动作和取消操作不能刷新商品。
- 当前目录包含 24 个稳定资产 ID，其中 8 套服装、16 件配饰；`cream-apple-cape` 是新档与 V10→V11 迁移的初始赠送，其余价格平均约 5🍎。购买按目录价格原子扣除，不得重复购买。衣架信息菜单分别打开全屏 `MiracleWardrobePage` 与独立舞台测试；舞台不属于奇迹页。Miracle 使用 `100dvh` 紧凑壳层：头部、三页签和状态提示固定占位，余高给当前面板；桌面搭配/合拍双栏并让画布与工具局部滚动，宽度不超过 860px 时改为单栏且只滚动活动面板，触控面不小于 44px。
- 可搭配目标为 `bingo | FriendId`，好友必须已经出现在 `state.friends`。同一角色最多保存 8 套具名造型；名称 1–20 字符，使用稳定 `lookId`，支持新建、更新与删除。编辑草稿留在组件内；保存时只写 `assetId`、稳定 `placementId` 与归一化 `x/y/scaleX/scaleY/rotation/z`，不写图片 URL、Blob、Data URL 或像素结果。两轴都以父画布宽度为基准，`scaleX === scaleY` 时保持素材天然宽高比。搭配室用当前草稿渲染角色透明 PNG，下载只生成临时位图，不写回造型或存档。
- 每套形象最多 12 个元素；同一已购资产可以通过不同 `placementId` 重复放置。移动使用主体拖拽，角落手柄控制两轴缩放与旋转；合拍角色数组必须包含 1–6 位，`bingo` 非必选，可以只包含已认识好友。人物整体也持久化双轴变换。相册最多 40 张，照片冻结当时的轻量搭配快照，之后换装不能改变旧照片。
- 合拍只选已拥有的明信片，预览与 PNG 画布使用明信片自身长宽比，背景完整铺满且不加遮罩。每张照片最多保存 12 个独立 `decorations`；它们直接属于照片、不属于人物，与人物共用照片级全局唯一 `z` 并可交错渲染，人物内部服饰继续使用各自局部 `z`。导出默认长边 2400，短边随明信片比例计算，优先加载 960 图并回落 480 图。合拍独立于 `collections`，不得影响收藏进度。
- 海星体、完整套装和配饰由三张本地 JPG 参考经 ImageGen 重绘，再由离线素材脚本产出同源透明 WebP；参考图中的文字、水印与原人物肢体不得进入公开素材。服装/配饰全局清除纯蓝核心色，对相邻两层软边衰减 alpha 并去蓝，保留色键范围外的服装蓝色细节；好友奶油底使用边界连通清除。网格切分按完整连通组件质心归格，并保留同格内达到合理面积阈值的多个组件，避免串入相邻格。

## 活动、意愿与魔法

- 活动种类仍为 `travel | stream | trend | music | rest`。开始时签发完整奖励计划，领取成功才让 `companionDays + 1`。
- 当前新睡觉计划固定 `baseApples: 0`，领取只刷新意愿、推进游戏日并触发日夜转场；V10→V11 会把旧存档中仍在进行或已完成待领取的睡觉 `baseApples` 同样归零，不兑现旧的 1🍎快照。
- 苹果钟也是陪伴日来源：专注阶段结束后进入休息阶段，完成整轮时才原子地 `companionDays + 1`。重复 tick、未到点 tick、截止前取消、普通现实停留结算与待办增删改/到期通知都不加天。
- `activity/cancel` 使用当前 `runId`；running 与 ready 都可取消。取消不计一天、不发奖励、不返还已经消耗的补给或幸运苹果。
- 意愿键为 `travel | computer | music`；刷播和冲热共享 `computer`。睡觉不受意愿拒绝。
- 灰色活动入口使用 `aria-disabled` 表达不愿意，但保留点击反馈；没有活力魔法时只显示拒绝，不能进入普通启动确认。
- ⚡瓶装速度魔法价格 2🍎。只允许在当前活动仍为 running 时使用，消耗一瓶并把该活动的 `endsAt` 设为使用时间；已经 ready 时不消耗。
- ✨瓶装活力魔法价格 7🍎。使用后立即把三组意愿设为真、清除疲劳；效果持续七个由“饼屋活动成功领取”或“苹果钟完成专注与休息整轮”推进的相伴日，不是七个自然日。苹果钟推进到第七日时同样清除效果并按偏好序列恢复当日意愿；已有有效效果或所有意愿本就可用时拒绝并不消耗。
- 冰箱共有七种道具，所有条目通过 `ITEM_COPY` 提供 emoji；金额只使用 `N🍎`。

## 奖励与收藏

- 默认概率：明信片 0.65、百万直拍 0.3、全站第一 0.15、旅行遇友 0.1、音乐好友每位已认识朋友 0.15。
- `addNonStackingBaseProbabilityBonus(base, ...rates)` 只取同类最高加成比例，并计算 `min(1, base + base × maxRate)`。🍎苹果旅行便当把未增强的 `travelFriend` 基础概率翻倍，默认 0.1 → 0.2；🍀幸运苹果把当前活动对应的未增强收藏概率翻倍，不改变遇友概率。两者分别作用于自己的目标概率，不能在已经增强后的结果上继续复合翻倍；收藏基础概率为 0 时不允许浪费幸运苹果。对玩家的文案只说“翻倍”，不暴露“增加 100%”的实现表达。
- 旅行先判朋友；命中后签发朋友、固定道具与按身份 2/3/4/3/2🍎，不再判明信片。未命中朋友时才判明信片；已经认识的朋友仍在完整五人候选池中。
- 音乐好友只能从活动开始时已经认识的好友集合中选择，不会解锁新好友；实际来访率为 `min(1, 0.15 × 已认识人数)`，命中后在已认识集合中等概率选取。课代饼/三好兔/心好兔/信号狗/饼哩饼哩分别赠 4/6/8/6/4🍎。默认至多五人时，期望值化简为 `0.15 × 已认识好友礼物总和`，因此每新增一位都严格增加期望；五人全识时为 4.2🍎。
- 已开始活动保存完整 `rewardPlan`。除 V10→V11 把旧睡觉的 `baseApples` 归零外，旧音乐 2/3/4/3/2🍎 与正式旧旅行 0🍎 计划继续按快照兑现；新旅行按课代饼、三好兔、心好兔、信号狗、饼哩饼哩依次固化 2/3/4/3/2🍎，绝不在导入时重算。
- 明信片和百万直拍从未拥有集合随机选择；全站第一按 `siteFirstChronology` 第一个未拥有项选择。
- DEBUG 的“一键全收集”同时获得三类收藏、全部好友与 24 件衣服，并把 `shop.assetIds` 清空；“清空收集”清空收藏、好友与全部 saved looks，`ownedAssetIds` 恢复为仅 `cream-apple-cape`，并在同一 `companionDay` 按 `min(3, remaining)` 强制重建商店；当前 24 件目录因此得到 3 件商品。历史合拍的轻量造型快照保留，只把已经失效的 `postcardId` 置空。不维护预制全收集存档。
- 收藏墙总标题与已解锁分类显示 `owned/?`；当且仅当该动态目录全部拥有时改为 `owned/total`。分母从当前 `catalog.items` / `catalog.friends` 派生，存档仍不保存总数。
- 收藏详情整体比例为桌面或横屏 16:9、手机竖屏 9:16；卡片缩略图和好友头像可用 `cover`，收藏详情、全屏预览和明信片选择器使用 `contain` 完整展示并允许留白，苹果钟运行背景使用 `cover` 铺满并允许裁切。百万直拍/全站第一的海报窗口不沿用固定详情比例，而是按原图真实比例自适应，整图无留白、无裁切。

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
- 顶栏把导航入口放在左组、运行状态和资源入口放在右组，自适应收缩且不相互覆盖。现实分钟、活力、🍎、收藏墙和 DEBUG 均为可点击按钮；现实分钟执行返回游戏维度，活力执行点击饼狗。旧“状态正常”不再派生或显示；刷播运行状态、轮次与倒计时只在独立在线刷播工具展示，主游戏 `StreamPanel` 只负责设置与启动入口。
- 信息栏使用三级文字合同：标题、强调、HUD 与主按钮使用可画乐融融；正文、说明和表单使用可画奶糖体，正文基线 `0.9rem`；辅助信息沿用奶糖体，基线 `0.82rem`。苹果数字继续使用乐融融。
- 宽度不超过 960px 时，带侧栏的主布局固定使用 `grid-template-areas: 'room' 'context'`，房间在上、信息区在下且不互相覆盖；桌面端保持 `room context` 左右两栏。
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
- 电脑端和移动端都可进入、恢复现实维度；设备能力判断只在打开 `reality-trend` 时拦截冲热。玩家可见提示只说冲热目前在电脑端开放，不描述输入设备、媒体查询或检测细节。
- 二楼现实入口拆分为“刷播”和“冲热（开发中）”；冲热页只保留居中的字母建设站入口。一楼“工作”先显示待办，再显示背景选择器；选项来自已拥有明信片与已保存奇迹合拍。
- `features/reality/stream/parser.ts` 接受单个可选裸 BVID 或 `http(s)` B 站完整视频链接，规范为 BVID 后写入 `reality.streamSettings.selfTestBvid`；`favoriteId` 只能取 `3682220021 | 3986840044`。当前刷播设置只持久化这两个字段。
- `features/reality/stream/useStreamPlayback.ts` 只在用户手势内同步 `window.open()` 一个名为 `SUperView` 的 430 × 760 独立窗口，并通过查询参数传入 `favoriteId`、`selfTest`、`stopHours`、`sessionId` 与 `autostart=1`。主游戏不创建 B 站 iframe，也不负责视频顺序；弹窗被拦截时只显示授权后重新开始。
- `StreamPanel` 把主说明、设备检查、弹窗权限、时长限制、继续运行提醒和“移动端离开刷播页面可能会导致刷播暂停。”合并为一个分点 guidance 容器，不再拆成多块非标准提示。主游戏与独立页都显示“请在网页版哔哩哔哩设置‘自动开播’和‘播完暂停’。” `src/stream-player/` 是“在线刷播工具”独立页实现。页面可从 URL 自动带入设置，也可在自身 UI 修改收藏夹、自测视频和定时停止后手动开始。固定使用同源 `favourites/<favoriteId>.txt`，`fetch(..., { credentials: 'same-origin' })` 后逐行校验 BV；运行时没有 B 站收藏夹 API、HTML 代理或 CORS 读取。
- `StreamRoundScheduler` 每轮用 Fisher–Yates 重新打乱收藏夹并把自测 BVID 固定追加在末尾；首个 iframe 立即创建，之后固定每 5 秒创建一个。URL 固定带 `autoplay=1&muted=1&danmaku=0&t=0`；界面不描述内部去重行为。
- 最后一个 iframe 创建后才以 `Date.now()` 设置轮次截止时间，生产默认 310 秒。到期先统一移除本轮全部 iframe，再完成轮次并立即开始下一轮；定时停止同样使用绝对墙钟截止。`visibilitychange` / `pageshow` 只调用 `reconcile()` 处理当前到期动作，不维护每秒自增计数器，也不补开多轮。
- 在线刷播工具挂载时即创建循环的低音量 WAV 保活音频，空闲、运行和停止后都保持，只有页面卸载时释放。播放器 iframe 始终真实存在；默认 CSS 隐藏，只有独立页 DEBUG 中选择“显示播放器”才展示。
- 隐藏 DEBUG 由独立页大标题连续点击 5 次后出现密码框，密码严格为 `SUperView`。解锁状态写入独立页 `localStorage`，重开页面自动恢复；“关闭 DEBUG”会清除该状态，之后再次开启需要重新验证密码。DEBUG 可修改本页轮次间隔并切换播放器显示；主游戏 DEBUG 与之完全解耦。
- 会话可快照 0–24 小时的定时停止，0/null 为不限时。轮次、下一轮倒计时、当前状态及最近 10 次任务只在独立页展示并写入独立页自己的 `localStorage`；主游戏不接收、不渲染也不写入新的轮次或会话统计，`reality.streamHistory` 仅作为冻结兼容字段随旧存档保留。每完成一轮调用 history upsert，以同一 `sessionId` 覆盖当前 `running/checkpoint` 记录；正常停止覆盖同一记录为 `final`，`pagehide` 只作兜底，保证硬关闭至少留下上一完整轮。0 轮正常停止也可形成 final。运行中的 iframe、定时器、保活音频和独立页 DEBUG 状态不进入 `.bingo`。
- 当前独立窗口发出同源且 session 匹配的受信 `started` 后，主 UI 以语义有效的本地 `YYYY-MM-DD` dispatch `stream/daily-reward-claim`，首次奖励 20🍎。点击开始、`window.open()` 成功或收藏夹开始加载均不触发；`lastRewardDateKey` 表示已经结算的最大本地日期，同日或更早日期的 claim 保持原状态且不产生 effect，只有严格更晚的现实日期首次 `started` 才能再次领取。`lastRewardDateKey` 即使苹果达到上限也会写入；实际到账数才累加 `statistics.applesEarned`，不改刷播活动的 `started/claimed`。这条 started/claim 管道不是轮次/会话统计，也不能证明 B 站真实播放。
- 苹果钟预设为 25+5、50+10、90+15 分钟。全屏层锁定启动时的 `PomodoroBackgroundRef`；明信片直接展示，奇迹合拍按持久构图动态重建，二者都以 `cover` 铺满背景并允许裁切，与可操作的游戏播放器控件、待办和饼狗共同组成焦点 UI。
- `clock/tick` 按绝对时间切换 focus → break → completed，并签发稳定 `notificationId` 的 effect；只在 completed 时推进陪伴日。

## 浏览器能力边界

- 通知权限只能在用户点击后请求。当前实现使用页面计时器并在 `focus` / `visibilitychange` 时补检查；页面完全关闭、系统休眠或浏览器冻结时不能保证准点系统通知。
- 标题页在两个圆形头像后、缓存/导入记录前渲染 `UpdateNoticeCard`，房间左上角 `#️⃣` 复用 `UpdateNoticeDialog`；两处读取同一 `CURRENT_UPDATE_NOTICE.version = 'v0.10.1'`。标题页卡片右侧 meta 纵向排列，独立版本胶囊在原日期上方，左侧正文不再混入版本；房间弹窗保留自己的版本胶囊。两处继续显示“刷播现在可以正常使用了”以及奇迹饼狗、多套造型和合拍相册条目。
- 首次进入或从旅程返回标题页时自动调用一次“检查更新”；同一次标题页停留以 ref 去重，目录、缓存、提示等重绘不会再次触发，玩家仍可用按钮手动再查。自动与手动检查共用当前 Service Worker registration 的 `update()`、状态和提示流程。无 Service Worker、未注册或网络失败时沿用对应状态；检查本身不强制安装更新。
- `needRefresh` 首次表明检测到新版本时自动下载当前缓存档；随后安装该版本前再次调用同一幂等备份入口，避免无备份刷新。
- 周期备份以 `lastPeriodicBackupRequestedAt ?? firstCachedAt` 为基准判断三天间隔；成功请求后写回 `lastPeriodicBackupRequestedAt`，避免重复下载。
- `prepareBrowserCache` 只要 payload 迁移/规范/协调/暂停旧页面租约后形成新对象或 `gameVersion` 过旧，就用 `updateBrowserGameCache` 同步 V12 payload、`0.10.1` 与 `updatedAt`；保留 `saveId`、`firstCachedAt`、`lastPeriodicBackupRequestedAt` 和外层 `cacheVersion: 1`。
- 守候音频只在三个旅程入口的明确用户手势中创建并复用，运行期保持开启；状态栏不显示开关。它不能绕过浏览器或操作系统的后台冻结策略。
- `useScreenWakeLock.ts` 只在移动主输入媒体查询匹配、旅程运行且页面可见时请求屏幕常亮；隐藏时释放、重新可见时再请求。API 缺失或权限拒绝静默降级，不把常亮请求解释为后台调度保证。
- GitHub Pages 是静态托管，浏览器不能伪造 B 站 Referer；B 站 API、DASH/MP4 流也不向当前 Pages Origin 提供可直接播放的跨域响应。因此不固化会过期的签名流地址，也不引入未知第三方代理，继续使用官方 iframe。
- 独立刷播页与收藏/唱片机播放器是两条独立调度边界，但都只嵌入官方 B 站 iframe。B 站 iframe 文档运行在 B 站来源下，浏览器按自身第三方 Cookie 策略决定是否附带现有 B 站会话；`allow="autoplay"` 只委托自动播放能力，`referrerPolicy` 只约束 Referer，不控制 Cookie。
- B 站 iframe 内自己的脚本会发起媒体、统计、历史或心跳请求。这些是嵌入文档的行为，不表示 GitHub Pages 父页实现了跨域访问。父页受同源策略限制，不能读取 iframe 的 Cookie、DOM、真实播放状态或网络响应，只能控制 URL、创建顺序、绝对时间和节点移除；轮次截止时销毁文档后，其后续活动才随文档结束。
- 刷播 iframe 的创建、移除、本地轮次和 `postMessage` 只证明本站调度发生，不能证明 B 站真实播放、播完、历史记录或计数增加。
- 两个微博头像原链接是带到期签名的外链，发布资源已下载到 `public/assets/links/` 并加入 Workbox 预缓存；第二个目标采用实际 href 与已有来源账号一致的 UID `7760819929`。
- 两款公开 WOFF2 使用《现代汉语常用字表》1988 年版的 2500 个“常用字”作为稳定底集，再合并 ASCII、中文标点和当前运行时表外用字。固定表由两份公开转录逐字同序交叉核对，构建/校验离线完成；校验会直接读取 WOFF2 的 cmap，确认当前必须字符实际存在，不再用文件哈希代替字形覆盖检查。真实资产名为可画乐融融与可画奶糖体，不声称存在额外甜心字体；乐融融用于 display 层，可画奶糖体用于 body/support 层。

## 关键目录与验证入口

```text
AllForSUXINHAO/TravellingBingo/src/domain/             # 领域、迁移、现实与播放器持久状态
AllForSUXINHAO/TravellingBingo/src/app/                # 应用接线、导入导出、通知、更新
AllForSUXINHAO/TravellingBingo/src/features/game/      # 房间、信息栏、HUD、设施
AllForSUXINHAO/TravellingBingo/src/features/player/    # 持久播放器、固定曲库与游戏控件
AllForSUXINHAO/TravellingBingo/src/features/reality/   # 刷播、冲热占位、苹果钟与待办 UI
AllForSUXINHAO/TravellingBingo/src/stream-player/      # 独立刷播页、墙钟调度与保活音频
AllForSUXINHAO/TravellingBingo/favourites/             # 两份唯一刷播 BV 文本快照
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

`npm run verify` 不包含 Playwright；浏览器 E2E 必须单独执行。测试播放器时只能断言请求 URL、iframe 生命周期、任务事件和持久状态，不能断言跨域 iframe 的真实播放状态。现实刷播测试应覆盖 BV/完整链接规范化与 V12 持久化、两份 TXT 唯一来源、`SUperView` 窗口与“在线刷播工具”标题、独立页参数/手动设置/自动开始、两页自动开播/播完暂停提示、移动端提示、每轮随机且自测末尾、固定 5 秒创建间隔、最后创建后墙钟等待 310 秒、轮末统一销毁、0/空不限时、独立 DEBUG 持久/关闭、默认隐藏播放器、页面常驻保活、同 session checkpoint/final upsert 与硬关闭保留完整轮、主游戏不写入轮次/会话统计、冻结兼容字段往返、受信 started 门槛、有效本地日期、同日/更早日期幂等与严格更晚日期再领，以及无代理/运行时收藏夹 API 请求；不得把 iframe `load`、本地轮次、窗口创建或每日奖励解释为 B 站真实播放或计数。迁移测试需固定 V10→V11 将尚未领取的旧睡觉 `baseApples` 归零、其他活动快照不变，并覆盖冻结 V11→V12 的单轴转双轴、空 decorations、苹果钟背景引用与空每日奖励日期。奇迹饼狗另需覆盖衣架缩略图及冰箱同款购买态、日初 `min(3, remaining)` 商店、购买后不补位、紧凑 100dvh/双栏/单栏滚动合同、多套造型、已遇好友权限、`scaleX/scaleY` 角落手柄、当前角色透明 PNG、照片独立 decorations 与全局 z、1–6 位合拍与饼狗非必选、动态明信片比例、相册删除、PNG 导出和 `.bingo` 不含位图；收藏/工作/UI 另覆盖百万直拍与全站第一海报真实比例、明信片/已保存合拍苹果钟背景、三级字体、移动端 room→context 顺序和公告 version/date DOM 顺序。
