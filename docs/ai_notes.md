# AI 工作笔记

## 当前状态

- 分支：`main`。
- 固定游戏路径：`/AllForSUXINHAO/TravellingBingo/`。
- 仓库根首页只做跳转入口；`AllForSUXINHAO/` 只容纳 `TravellingBingo/`。
- V3 领域、存档迁移、内容目录与界面整合已经冻结；发布前仍以最新工作树的完整门禁、生产浏览器回归和线上复核为准。

## 已确认并已写入代码的 V3 领域合同

### 状态与计时

- 业务 payload 为 `GameStateV3`，`schemaVersion: 3`。`.bingo` 外层文件格式仍使用独立的封套版本，不能把二者混为一个字段。
- `profile` 新增 `displayName` 和 `companionDays`。用户名去除首尾空白，允许 1–16 个 Unicode 字符；新游戏陪伴天数从 0 开始。
- `ActivityKind` 为 `travel | stream | trend | music | rest`。五类活动默认时长均为 `112_000 ms`。
- 活动保存 `startedAt`、`endsAt`、`rewardSeed`、完整 `rewardPlan`、本次补给和幸运苹果快照。页面和导入逻辑只用绝对 `endsAt` 判断 running / ready，不以当前默认时长重算旧活动。
- `activity/claim` 是陪伴天数唯一递增点，每次成功领取恰好 `+1`；打开面板、房间移动和普通任务事件不增加天数。
- `activity/cancel` 可取消 running 或 ready 的当前活动。成功取消清空活动，但不增加陪伴天数、不退还已扣补给或幸运苹果，也不回滚开始活动时已经推进的奖励随机序列。
- `rest` 和 `music` 不需要补给；`travel / stream / trend` 在开始时扣除对应库存。所有开始操作必须先通过“无其他活动、意愿、库存、时长与目录”检查。

### 意愿与位置

- V3 意愿键为 `travel | computer | music`；`stream` 与 `trend` 都映射到 `computer`，`rest` 不受意愿拒绝。
- DEBUG 调整时长与概率，不强制改写意愿。
- 开始活动后位置为：旅行 `outside`，刷播/冲热 `computer`，弹琴 `piano`，睡觉 `bed`。旅行取消或领取后回到 `door`，其余活动停留在对应区域。
- 睡觉完成生成新一轮意愿并清除疲劳；日夜转场只属于 UI 瞬时效果，不写进存档。

### 奖励与概率

- `DEFAULT_GAME_BALANCE.probabilities`：`postcard: 0.65`、`millionShot: 0.4`、`siteFirst: 0.1`、`travelFriend: 0.2`、`musicFriend: 0.2`。
- 幸运苹果对当次收藏掉落增加 `0.20`，苹果旅行便当对当次旅行遇友增加 `0.15`；均用 `Math.min(1, base + bonus)` 封顶。
- 旅行先判 `travelFriend`。命中好友后写入 `friendId` 与固定道具 `giftItemId`，不再判明信片；没有命中好友时才以明信片概率继续判定。新 V3 活动严格保证旅行好友与明信片互斥。
- 旅行好友赠送固定道具，不赠 🍎：课代饼→普通旅行便当，三好兔→苹果旅行便当，心好兔→幸运苹果，信号狗→信号耳机，饼哩饼哩→热度工具箱。
- 弹琴只从 `knownFriendIds` 选择来访者；尚未认识好友时即使概率为 100% 也不会出现来访。固定赠礼为：课代饼 2🍎、三好兔 3🍎、心好兔 4🍎、信号狗 3🍎、饼哩饼哩 2🍎。
- 睡觉的奖励计划固定为 `baseApples: 1`，领取时获得 1🍎、陪伴天数 `+1` 并刷新意愿。
- 朋友记录持久化 `firstMetAt / lastMetAt / encounterCount / totalGiftApples`。旅行道具不计入 `totalGiftApples`，音乐赠礼计入。
- 明信片和百万直拍过滤已拥有 ID 后随机选取；全站第一从 `siteFirstChronology` 找第一个未拥有 ID。三类都不重复。
- V2 进行中旅行可能历史上同时计划朋友与明信片；迁移必须忠实保留旧奖励快照。互斥规则只约束新开始的 V3 活动，不能篡改已签发的旧活动。

### 任务与可验证事件

- 任务板仍保持恰好三条，单条完成立即发放其奖励；整板完成后原子刷新，旧板最后一个事件不继续推进新板。
- 电子琴事件是 `piano-note-played`；唱片机与收藏详情内嵌 B 站 iframe 只能可靠记录 `record-player-opened` / `collection-player-opened`。跨域播放器不能宣称视频真的播放或播放完毕。
- 任务不能把开始一个有消耗的活动同时设计为赚取同一货币的动作；睡觉与音乐好友赠礼属于各自完整读条结果，不是补给消费返现。

## 存档与迁移

- 新导出使用 `gameVersion: 0.3.0-demo.1` 和 V3 业务 payload；摘要在迁移前针对原始 payload 校验。
- V1 与 V2 都使用严格历史 schema 读取，然后迁移为 V3。历史档默认用户名为“你”，陪伴天数由历史 `statistics.claimed` 的旅行、刷播和冲热领取次数合计推导。
- V1/V2 进行中活动保留原始 `startedAt`、`endsAt`、`rewardSeed` 和奖励结果；迁移、余额规范化或之后调整默认时长都不得改写旧 `endsAt`。
- V3 往返保留用户名、陪伴天数、好友图鉴、任务、意愿、调试平衡、随机序列与进行中活动。
- 收藏推进只持久化拥有项；不保存目录总数、全站第一下一指针或分类解锁列表。好友分类同理由 `friends` 记录派生。
- 冻结回归夹具位于 `src/infrastructure/persistence/fixtures/`，覆盖已发布 V1 普通档、V2 进行中档与 V2 DEBUG 档。

## 内容与素材现状

- `public/data/postcards.json`：100 项，来自用户指定的 Bilibili Toy 归档；选择清单为人工联系表筛选，公开 480 / 960 WebP。
- `public/data/million-shot-posters.json`：30 项，每项附静态 `video` 元数据。
- `public/data/site-firsts.json`：8 项，每项附静态 `video` 元数据；chronology 从 Dynamite 到 POWER。
- `public/data/friends.json`：5 位好友，公开图位于 `public/assets/friends/`。
- `public/data/video-catalog.json`：锁定百万直拍收藏夹 `1130054521`、全站第一收藏夹 `3489626721` 的静态快照、海报映射和唱片机曲目。运行时不调用收藏夹 API；外链 iframe 使用 BVID。
- `Survivors`（`million-shot-108`）已换成正确的第二张红白纪念海报，公开尺寸为 480 × 720 与 800 × 1200。
- 房间唯一母版仍为 `resources/raw/travelling-bingo/generated/chan-chan-house-v2.png`（1098 × 1433），严格基于用户 `image-1` 的竖版构图。
- 好友母版为 `resources/raw/travelling-bingo/generated/friend-atlas-v3.png`，公开图从该母版裁切；角色身份、四肢完整性和卡片裁切已做联系表视觉检查。
- 字体源位于 `resources/raw/travelling-bingo/fonts/`；公开页面只发布字符子集 WOFF2。

## V3 UI 冻结契约（并发整合后再验收）

### 网格与待机

- 顶栏和内容共用同一左右页面 inset：房间左边对齐顶栏左边，信息栏右边对齐顶栏右边。
- 顶栏到内容的纵向 gap 与房间到信息栏的横向 gap 使用同一个 token，约为旧横向 gap 的一半；不要把“gap 减半”误解为页面 inset 减半。
- `PanelId` 允许 `null`。`null` 是待机态：信息栏不渲染，房屋横向铺展。设施激活后房屋收窄并左移，信息栏从右侧出现。
- 点击房间无热点空白或按 Escape 回到待机；点击饼狗和设施不应冒泡触发收起。

### 顶栏与文字

- 顶栏中心固定为“今天也要 / 好好吃苹果”，保持真正居中并适当放大。
- 右侧显示“{displayName}陪伴饼狗已经 N 天”、`N🍎`、`🖼️` 与 DEBUG。货币的可见数值一律使用 `N🍎`，不出现“补充·X个苹果”“带回 X 个苹果”或“苹果只在游戏里流通”。
- 冰箱动作使用“为冰箱补充”；衣架面板正文使用“什么样的搭配最合适呢？”。
- 房间设施按钮和收藏分类标签用可画乐融融；正文、小型控件和日期用可画奶糖体，日期中的“月”不能落到错误字体。

### 活动、位置与结果

- 每类读条开始前在信息栏二次确认；开始后左下角显示取消/返回按钮。取消必须明确提示不返还已经用掉的补给。
- 不再显示“打开冰箱”“去电脑前”底部捷径；空闲信息栏展示三组意愿（旅行、电脑、音乐）。拒绝按钮暗淡但可点击，点击显示领域拒绝消息。
- 饼狗脚底锚点必须和床铺、电脑、电子琴、房门严格对齐；睡觉不能落在上下层走道。旅行时不渲染饼狗 DOM。
- 奖励对话框顶部角色图只显示当前帧，不得泄漏上一张 sprite；明信片结果不显示泛化的“活动完成”。
- 奖励与详情隐藏可见滚动条，但仍保留滚轮、触控与键盘滚动能力。

### 房间功能

- 右上角问号说明设施、读条、🍎 获得和 🍎 花费，文案保持世界内表达。
- 电子琴覆盖两个八度，共 24 个半音；弹琴读条期间保持可交互，并通过 Web Audio 响应鼠标、触摸与键盘。
- 唱片机使用 `ContentCatalog.recordPlayerVideos` 选择静态目录曲目，iframe 地址使用 `https://player.bilibili.com/player.html?bvid=...&p=1&autoplay=0&danmaku=0`。
- 百万直拍和全站第一详情从条目 `metadata.video` 显示标题、作者、发布时间、BVID 与内嵌播放器；不维护另一套手写映射。
- 收藏墙增加“好朋友们”；只在 `friends` 非空时显示。朋友相遇结果使用真实好友图，并显示本次道具或 🍎 赠礼。

## 关键路径

- 完整实现方案：`docs/旅行饼狗网页完整实现方案.md`
- 原始纲要：`docs/specs/旅行饼狗开发纲要.md`
- Web 应用：`AllForSUXINHAO/TravellingBingo/`
- V3 领域状态与调参：`AllForSUXINHAO/TravellingBingo/src/domain/`
- 页面、房间与动画：`AllForSUXINHAO/TravellingBingo/src/features/`
- 存档：`AllForSUXINHAO/TravellingBingo/src/infrastructure/persistence/`
- 内容 schema 与合并目录：`AllForSUXINHAO/TravellingBingo/src/content/`
- 素材母版：`resources/raw/travelling-bingo/`
- 素材和站点脚本：`scripts/`
- Pages 工作流：`.github/workflows/static.yml`

## 待最终验证

1. 等并发 UI、内容和 App 接口稳定后，检查 `git diff`，确认没有代理覆盖或漏接 `friends` / `videosByBvid` / `recordPlayerVideos`。
2. 运行 `npm run verify`、`npm run build`、`npm run site:assemble`、`npm run site:verify`。
3. 运行桌面和移动端 Playwright，覆盖待机展开、设施收缩、二次确认、取消无返还、睡觉床铺位置、电子琴、播放器和好友结果。
4. 浏览器验证旅行朋友与明信片互斥、音乐只召唤已认识好友、65%/10% 概率边界和 DEBUG 不强制意愿。
5. 对 V1/V2 冻结夹具、V3 往返、旧活动绝对 `endsAt` 和内容目录扩充做完整回归。
6. 本地完成后再提交、推送与部署；上线后重新打开根入口和游戏路径，检查网络、PWA 缓存与控制台。
