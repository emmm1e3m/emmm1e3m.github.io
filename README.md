# 旅行饼狗

“旅行饼狗”是一款以饼狗为主角的离线收集网页游戏。GitHub Pages 根首页只提供入口，游戏固定位于：

```text
/AllForSUXINHAO/TravellingBingo/
```

## 一键本地启动

需要 Node.js 24 和 npm 11 或更高版本。Windows 下双击根目录的 [启动旅行饼狗.cmd](./启动旅行饼狗.cmd)：

- 自动切换到仓库根目录；
- 检查 Node.js 和 npm 版本；
- `node_modules/` 或依赖锁标记缺失、`package-lock.json` 发生变化时执行干净安装；
- 使用固定的 `localhost:5173` 启动开发服务器；
- 自动打开 `http://localhost:5173/AllForSUXINHAO/TravellingBingo/`；
- 端口被占用或启动失败时保留窗口和中文错误信息。

根目录 `.cmd` 只负责稳定唤起 [scripts/dev/start-travelling-bingo.ps1](./scripts/dev/start-travelling-bingo.ps1)；环境检查和 Vite 参数集中在 PowerShell 脚本中，避免两份启动逻辑漂移。

也可以手动启动：

```powershell
npm ci
npm run dev -- --host localhost --port 5173 --strictPort --open "/AllForSUXINHAO/TravellingBingo/"
```

## V3 游玩闭环

- 新旅程会记录用户名；每领取一次有读条的活动结果，陪伴天数增加一天。旅行、刷播、冲热、弹琴和睡觉都使用 112 秒的绝对时间读条。
- 五类读条都可以取消。取消不增加陪伴天数，也不返还开始时已经消耗的补给；进行中活动的 `startedAt`、`endsAt` 和奖励快照会写进 `.bingo`，重新导入后仍按原绝对结束时间恢复。
- 房间里始终有三条可完成的 Bingo 小任务；每条完成时获得 🍎，整组完成后刷新三条新任务。睡觉完成后另得 1🍎 并刷新饼狗的活动意愿。
- 饼狗对旅行、电脑活动和音乐分别有自己的意愿；刷播与冲热共享“电脑”意愿。DEBUG 只调整参数，不会把所有意愿强制改为愿意。
- 旅行先判定是否遇见朋友；遇见朋友时朋友赠送道具，本次不会同时获得明信片。没有遇见朋友时再按 65% 基础概率判定明信片。弹琴结束后有机会请已经认识的朋友来分享乐曲，并获赠 2–4🍎。
- 默认基础概率为：明信片 65%、百万直拍 40%、全站第一 10%、旅行遇友 20%、音乐遇友 20%。幸运苹果与苹果旅行便当的单次加成统一由 `gameBalance` 管理。
- 明信片和百万直拍从当前未拥有集合中随机选取；全站第一按时间从 Dynamite 由旧到新领取，当前目录到 POWER，三类都不会再次抽到已拥有项。POWER 只是当前最新项，目录以后仍可继续追加。
- “饼狗的收藏墙”只显示已经获得的内容，明信片、百万直拍、全站第一与“好朋友们”都在首次获得或遇见后才出现。收藏按时间新到旧排列；存档不写死任何目录总数或分类解锁列表。
- 当前内容目录包含 100 张 Bilibili Toy 明信片、30 张百万直拍、8 项全站第一和 5 位好友。百万直拍与全站第一条目都关联静态 B 站视频元数据；唱片机从锁定的收藏夹最新页曲目中选择内嵌播放。
- 待机时点击房间空白会收起信息栏并展开房屋；点击设施后房屋收窄，信息栏按同一紧凑间距出现。界面中的货币数值统一写成 `N🍎`，不显示“X 个苹果”式系统文案。
- 房间以用户提供的竖版 `image-1` 为唯一母版做高清精修，严格保留原构图、风格、两层结构与物件位置；网页发布 768 和 1098 宽两档竖版 WebP。

完整产品、领域、存档、视觉与验收规则见 [docs/旅行饼狗网页完整实现方案.md](./docs/旅行饼狗网页完整实现方案.md)。

## 目录约定

```text
AllForSUXINHAO/TravellingBingo/   # 游戏源码与公开运行时资源
docs/                             # 纲要、实现方案与交付记录
research/travelling-bingo/        # 结构化资料、来源与锁定清单
resources/raw/travelling-bingo/   # 本地母版、原图和字体源
scripts/                          # 素材、站点组装与校验脚本
```

`AllForSUXINHAO/` 只放置 `TravellingBingo/`。构建中间目录、测试报告和本地依赖不纳入 Git；Pages 只发布隔离组装的 `_site/`。

## 常用命令

```powershell
npm run verify
npm run build
npm run site:assemble
npm run site:verify
npm run test:e2e
```

### 清理可重建产物

先预览：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maintenance/clean-workspace.ps1 -WhatIf
```

确认后清理：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maintenance/clean-workspace.ps1
```

脚本只允许删除仓库根目录下的 `dist/`、`_site/`、`coverage/`、`playwright-report/`、`test-results/` 和 `.playwright-cli/`。它会先校验每个绝对路径，拒绝文件、重解析点和仓库外目标；不会处理 `node_modules/`、`resources/`、`research/` 或字体。

素材处理脚本位于 `scripts/assets/`。100 张明信片只从指定的 Bilibili Toy 归档生成 Web 衍生图，不使用生成图代替；`Survivors` 已使用正确的第二张官方纪念海报。房间唯一母版为 `resources/raw/travelling-bingo/generated/chan-chan-house-v2.png`（1098 × 1433），派生图为 `chan-chan-house-v2-768.webp` 与 `chan-chan-house-v2-1098.webp`。字体源文件位于 `resources/raw/travelling-bingo/fonts/`，公开页面只使用按字符集生成的 WOFF2 子集。

## 发布

推送到 `main` 后，GitHub Actions 执行校验、构建、站点组装和公开边界检查，然后部署 `_site/`。线上入口：

- [站点根首页](https://emmm1e3m.github.io/)
- [旅行饼狗](https://emmm1e3m.github.io/AllForSUXINHAO/TravellingBingo/)
