# AI 工作笔记

## 稳定项目边界

- 游戏路径固定为 `/AllForSUXINHAO/TravellingBingo/`；仓库根首页只做入口。
- 当前业务状态为 `GameStateV5`，`schemaVersion: 5`；新导出封套中的 `gameVersion` 为 `0.5.0-demo.1`。
- `localStorage` 单槽缓存是日常主存档，`.bingo` 是自动备份与跨浏览器导入格式。收藏、好友和视频目录是当前版本输入，不复制进存档。
- 标题页有缓存时显示“继续”，并始终提供“全新旅程”“本地存档”。全新旅程或本地导入覆盖缓存前先备份旧档；首次获得新的全站第一或认识新朋友形成关键节点时、距离上次周期备份满三天时、检测到网页更新时也自动请求下载当前档。
- 运行时不抓取 B 站收藏夹或微博页面；BVID、作者、发布时间、海报映射和唱片机内置曲目来自构建期静态目录。

## V5 状态与迁移不变量

应用目录 `AllForSUXINHAO/TravellingBingo/` 下的关键路径：

- `src/domain/game/types.ts`：`GameStateV1`–`GameStateV5`、动作与 effect。
- `src/domain/game/migrateGameStateV1.ts`–`migrateGameStateV4.ts`：逐代迁移；冻结的 V1–V4 schema 不回写新字段。
- `src/app/gameStateSchema.ts`：严格历史 schema 联合与 V5 导出 schema。
- `src/infrastructure/persistence/browserGameCache.ts`：浏览器缓存封套与单槽读写。
- `src/app/App.tsx`：三入口、缓存同步、自动备份、通知、更新检查和守候音频接线。

导入顺序固定为：

1. 按文件原始 payload 校验 SHA-256 摘要。
2. 用对应的严格 V1–V5 schema 解析。
3. 显式迁移至 V5。
4. 规范未来活动使用的平衡配置。
5. 用当前目录协调可安全修复的旧引用。
6. 执行最终语义校验后才进入旅程。

必须保持：

- 迁移不重算 `activeActivity.startedAt`、`endsAt`、`rewardSeed` 或 `rewardPlan`。
- 新 V5 活动默认 `10_000 ms`；迁移不得改写已经开始活动的绝对结束时间。
- 收藏存档只保存已拥有 ID、首获时间与重复次数，不保存目录总数、全站第一指针或分类解锁数组。
- 好友存档只保存已遇见记录，不保存好友目录总数或图片元数据。
- V5 导入可清除已经不再拥有的苹果钟明信片背景，但不能借协调步骤掩盖非法奖励组合、未知奖励 ID 或被篡改的活动时间。
- V5 任务板以 `completedAt` 记录最后一项完成时间；全完成板保留到完成后的下一个本地零点，由统一截止时间计时自动刷新，页面休眠后聚焦时补检查；未完成板跨日保留。

`GameStateV5` 在 V4 基础上新增或调整的持久字段：

```text
world: game | reality
player.effects.vitality
reality.pomodoro.session.status / focusEndsAt / cycleEndsAt
tasks.completedAt
musicPlayer.currentBvid / currentIndex / loopMode
```

当前面板、弹窗焦点、琴键按下状态、奖励弹窗和布局动画仍是 UI 瞬时状态，不写入存档。

## 活动、意愿与魔法

- 活动种类仍为 `travel | stream | trend | music | rest`。开始时签发完整奖励计划，领取成功才让 `companionDays + 1`。
- 苹果钟也是陪伴日来源：专注阶段结束后进入休息阶段，完成整轮时才原子地 `companionDays + 1`。重复 tick、未到点 tick、截止前取消、普通现实停留结算与待办增删改/到期通知都不加天。
- `activity/cancel` 使用当前 `runId`；running 与 ready 都可取消。取消不计一天、不发奖励、不返还已经消耗的补给或幸运苹果。
- 意愿键为 `travel | computer | music`；刷播和冲热共享 `computer`。睡觉不受意愿拒绝。
- 灰色活动入口使用 `aria-disabled` 表达不愿意，但保留点击反馈；没有活力魔法时只显示拒绝，不能进入普通启动确认。
- ⚡瓶装速度魔法价格 3🍎。只允许在当前活动仍为 running 时使用，消耗一瓶并把该活动的 `endsAt` 设为使用时间；已经 ready 时不消耗。
- ✨瓶装活力魔法价格 12🍎。使用后立即把三组意愿设为真、清除疲劳；效果持续七个由“饼屋活动成功领取”或“苹果钟完成专注与休息整轮”推进的相伴日，不是七个自然日。苹果钟推进到第七日时同样清除效果并按偏好序列恢复当日意愿；已有有效效果或所有意愿本就可用时拒绝并不消耗。
- 冰箱共有七种道具，所有条目通过 `ITEM_COPY` 提供 emoji；金额只使用 `N🍎`。

## 奖励与收藏

- 默认概率：明信片 0.65、百万直拍 0.3、全站第一 0.1、旅行遇友 0.2、音乐好友 0.2。
- 幸运苹果对当前活动对应的收藏概率做 `+0.10` 加法，即提高 10 个百分点并封顶为 1，不作相对乘法。
- 旅行先判朋友；命中后只签发朋友与固定道具，不再判明信片。没有朋友时才判明信片。
- 音乐好友只能从活动开始时已经认识的好友集合中选择，不会解锁新好友；固定赠送 2–4🍎。
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
- 每次选曲固定请求 `autoplay=1`，详情打开即请求播放。iframe 是 `inert` 的纯画面层；游戏控件负责显示/隐藏、暂停/继续和取消。
- 显示/隐藏不重建 iframe；暂停冻结游戏估算进度并卸载 iframe，继续从估算秒数重建，取消移除请求。
- 状态层只保存当前 BV、索引和列表/单曲/随机模式；当前请求、暂停估算位置和画面展开状态不写入存档。
- 唱片机固定提供八首全站第一（Dynamite 至 POWER），不提供自定义曲库。单曲模式主动上一首、下一首仍移动到相邻曲目，只有游戏计时结束时才重播当前曲目。
- 官方 iframe 没有稳定的父页播放状态接口；当前从 iframe 加载后按静态目录中的 `durationSeconds` 维护游戏计时并尽力续播，不能可靠核对第三方真实进度或结束。

## 现实生活维度

- `reality/enter` 记录绝对 `enteredAt`；`reality/leave` 计算完整十分钟数并生成 `pendingSettlement`。
- `reality/settle` 中 `serious` 获得全额，`not-serious` 获得 `floor(full / 2)`；未完成十分钟时全额为 0。
- `browserPlatform.ts` 只用 `(hover: hover) and (pointer: fine)` 表达 PC 主输入能力，不用 UA 名单或窗口宽度；进入前与确认时各检查一次。非 PC 恢复 reality 存档时只显示显式返回与结算入口。
- 二楼“数据”直接显示刷播、冲热和运行组链接；一楼“工作”先显示待办，再显示专门的明信片选择器。
- 苹果钟预设为 25+5、50+10、90+15 分钟。全屏层锁定启动时的明信片并以 `cover` 铺满背景、允许裁切，与可操作的游戏播放器控件、待办和饼狗共同组成焦点 UI。
- `clock/tick` 按绝对时间切换 focus → break → completed，并签发稳定 `notificationId` 的 effect；只在 completed 时推进陪伴日。

## 浏览器能力边界

- 通知权限只能在用户点击后请求。当前实现使用页面计时器并在 `focus` / `visibilitychange` 时补检查；页面完全关闭、系统休眠或浏览器冻结时不能保证准点系统通知。
- “检查更新”调用当前 Service Worker registration 的 `update()`。无 Service Worker、未注册或网络失败时显示对应状态；检查本身不强制安装更新。
- `needRefresh` 首次表明检测到新版本时自动下载当前缓存档；随后安装该版本前再次调用同一幂等备份入口，避免无备份刷新。
- 守候音频只在三个旅程入口的明确用户手势中创建并复用，运行期保持开启；状态栏不显示开关。它不能绕过浏览器或操作系统的后台冻结策略。
- GitHub Pages 是静态托管，浏览器不能伪造 B 站 Referer；B 站 API、DASH/MP4 流也不向当前 Pages Origin 提供可直接播放的跨域响应。因此不固化会过期的签名流地址，也不引入未知第三方代理，继续使用官方 iframe。
- 两个微博头像原链接是带到期签名的外链，发布资源已下载到 `public/assets/links/` 并加入 Workbox 预缓存；第二个目标采用实际 href 与已有来源账号一致的 UID `7760819929`。

## 关键目录与验证入口

```text
AllForSUXINHAO/TravellingBingo/src/domain/             # 领域、迁移、现实与播放器持久状态
AllForSUXINHAO/TravellingBingo/src/app/                # 应用接线、导入导出、通知、更新
AllForSUXINHAO/TravellingBingo/src/features/game/      # 房间、信息栏、HUD、设施
AllForSUXINHAO/TravellingBingo/src/features/player/    # 持久播放器、固定曲库与游戏控件
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
