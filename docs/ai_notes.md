# AI 工作笔记

## 当前状态

- 分支：`feature/travelling-bingo-v2`。
- 固定游戏路径：`/AllForSUXINHAO/TravellingBingo/`。
- 仓库根首页只做跳转入口；`AllForSUXINHAO/` 只容纳 `TravellingBingo/`。
- 首版已经上线，但 v2 正在并行重构。本文中的 v2 规则是当前实现合同；未经新一轮完整验证的项目不得写成已通过。

## 已确认的 v2 决策

### 玩法与经济

- 常规活动时长为 `112_000 ms`，继续保持 `startedAt / endsAt` 绝对时间模型。
- `activeActivity.startedAt / endsAt` 随 `.bingo` 原样持久化；读档按原 `endsAt` 判断完成，不用当前默认时长重算，因此后续增加默认时长不会延长已开始的活动。
- 任务板始终三条；单条完成即奖励苹果，整板完成后原子生成新的三条，完成事件不继续污染新板进度。
- 任务只使用无苹果消耗的房间事件；补给购买、活动启动和领奖不推进任务。
- 苹果的常规来源只是 Bingo 任务；苹果只用于向冰箱中补充道具或其他明确的单向消耗。
- 活动、收藏结果和朋友事件都不返还苹果。

### 偏好、位置与睡眠

- 饼狗的位置和活动偏好属于领域状态。偏好随机序列必须与奖励、任务序列分离。
- 被拒绝的活动不扣库存、不推进随机序列、不产生奖励计划。
- 每个清醒周期保证至少一种活动可做。床铺休息只在无进行中活动时成功，不消耗苹果，并重置疲劳和偏好。
- 日夜变暗再变亮是 UI 瞬时效果，不将动画进度写进存档。
- 旅行中及待领取时饼狗不渲染；刷播和冲热时饼狗位于电脑区。当前位置的房间热点隐藏，点饼狗打开行动菜单。

### 概率与奖励

- 默认全站第一基础概率是 `0.10`，取消会抬高长期实际命中率的保底。
- 全站第一、百万直拍、明信片与朋友相遇的基础概率，以及两项补给的单次加成，统一由 `gameBalance` 模块管理；偏好生成参数也必须只有一个调参源。
- 幸运苹果给当次对应收藏掉落概率增加 `0.20`（20 个百分点），苹果旅行便当给当次遇见朋友概率增加 `0.15`（15 个百分点），都按 `Math.min(1, base + bonus)` 封顶 `1`。
- 基础收藏掉落概率已为 `1` 或对应分类已集齐时，幸运苹果不可使用，失败路径不扣幸运苹果。
- DEBUG 覆盖必须走 reducer 并校验 `[0, 1]`；覆盖仅影响之后开始的活动，不改变已经写入 `rewardPlan` 的结果。
- 不维护预制的全收集存档；DEBUG 的“一键全收集”按当前收藏目录即时生成调试状态。
- 全站第一命中标题为“全站第一！”；未命中为“很遗憾没能拿到全站第一”。百万直拍是收藏类别，不作为所有活动的总目标。

### 收藏

- 标题固定为“饼狗的收藏墙”。
- 明信片和百万直拍在当前目录中过滤已拥有 ID，再从剩余集合中随机选一项；剩余集合为空时不产生收藏。
- 全站第一使用当前目录的 `siteFirstChronology`，选取由旧到新的第一个未拥有 ID。当前序列从 Dynamite 开始、到 POWER；新内容可在 POWER 之后继续追加。
- 三类奖励都排除已拥有 ID，每个 ID 最多获得一次，没有收藏兑换分支。
- 存档只保存 `collections` 中的已拥有项；目录总数、全站第一下一索引与 `unlockedCategories` 都从当前目录和已拥有集合派生，不持久化。
- 旧存档只要其已拥有 ID 仍存在，就能直接在扩充目录下导入，新增 ID 自动作为未拥有候选。
- 通用全站第一 schema 验证 `chronology` 从 1 开始、连续、无重号且首项为 Dynamite；不能验证 POWER 永久为末项。
- 只显示已获得卡片和已解锁分类，按 `firstObtainedAt` 降序、ID 稳定次序排列。
- 未全收集时不显示总数、百分比或未解锁占位；首次获得分类需要一次性惊喜反馈。
- 收藏缩略图使用 `object-fit: cover`。

## 素材与字体

- 真实收藏目录仍为 12 张 Bilibili Toy 明信片、30 张百万直拍和 8 项全站第一。明信片严禁用生成图替代。
- v2 房间唯一母版：`resources/raw/travelling-bingo/generated/chan-chan-house-v2.png`（1098 × 1433）。它是对用户 `resources/raw/travelling-bingo/references/outline/image-1.png`（509 × 665 竖版）的直接高清精修，只提升清晰度与局部质感，严格保留原风格、竖版构图、两层结构、树冠、人物、兔子装饰和家具位置。
- 房间公开图只有 `chan-chan-house-v2-768.webp`（768 × 1002）与 `chan-chan-house-v2-1098.webp`（1098 × 1433），不保留其他构图版本。
- v2 饼狗动作母版：`bingo-actions-v2.png` 与 `bingo-walk-v2.png`；`*-chroma.png` 是可重建的中间稿，不应进入 Git。
- 字体源已归位到 `resources/raw/travelling-bingo/fonts/`。标题使用“可画乐融融”，小型 UI 使用“可画奶糖体”；网页仅发布 WOFF2 子集，不直接发布近 49 MB 的源字体。
- 房间热点继续以竖版母版的家具锚点比例定位，不为适配界面改变母版物件关系。

## 启动脚本

- 路径：`启动旅行饼狗.cmd`。
- `.cmd` 只负责转交到 `scripts/dev/start-travelling-bingo.ps1`，避免重复维护两套启动逻辑。
- 先 `cd /d "%~dp0"`，防止从桌面或其他目录启动时找错项目。
- 检查 Node.js 24 和 npm 11+；`node_modules/` 或依赖锁标记缺失、`package-lock.json` SHA-256 变化时执行 `npm ci --no-audit --no-fund`。
- 固定 `localhost:5173`、开启 `--strictPort`，自动打开 `/AllForSUXINHAO/TravellingBingo/`。
- 环境、安装、端口或服务器错误都会保留窗口并输出中文说明。

## 工作区清理脚本

- 路径：`scripts/maintenance/clean-workspace.ps1`。
- 白名单仅有根目录的 `dist`、`_site`、`coverage`、`playwright-report`、`test-results`、`.playwright-cli`。
- 每个目标都使用绝对路径、直接父目录与叶子名三重校验；文件或重解析点会被拒绝。
- 支持 `-WhatIf`；已验证预览不删除任何文件。
- `node_modules`、`resources`、`research` 和字体不在白名单中。

## 关键路径

- 完整实现方案：`docs/旅行饼狗网页完整实现方案.md`
- Web 应用：`AllForSUXINHAO/TravellingBingo/`
- 领域状态与调参：`AllForSUXINHAO/TravellingBingo/src/domain/`
- 页面、房间与动画：`AllForSUXINHAO/TravellingBingo/src/features/`
- 存档：`AllForSUXINHAO/TravellingBingo/src/infrastructure/persistence/`
- 素材母版：`resources/raw/travelling-bingo/`
- 素材和站点脚本：`scripts/`
- Pages 工作流：`.github/workflows/static.yml`

## 待最终验证

1. 先检查 `git diff` 和未跟踪文件，确认生成中间图、源字体与构建产物边界。
2. 运行 `npm run verify`、`npm run build`、`npm run site:assemble`、`npm run site:verify`。
3. 运行桌面和移动端 Playwright，必须覆盖新任务板、收藏解锁、偏好拒绝、日夜转场、旅行隐身、DEBUG 概率和舞台测试备用链接。
4. 对存档 v1 迁移、v2 往返和目录扩充后旧档兼容做单元和真实浏览器双重验证。
5. 本地完成后再提交、走 PR 和 Pages；上线后重新打开根入口与游戏路径，检查网络、缓存和控制台。
