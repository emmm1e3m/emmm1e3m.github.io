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

## v2 游玩闭环

- 房间里始终有三条可完成的 Bingo 小任务；每条完成时获得苹果，整组完成后刷新三条新任务。
- 苹果用于向冰箱中补充旅行、刷播和冲热所需的道具；活动本身只产出收藏或朋友事件。
- 常规活动时长为 112 秒，采用绝对时间计时，页面休眠或重新导入后仍能正确恢复。
- 饼狗有自己的活动偏好；不想做的活动不会扣除道具，去床铺休息可通过日夜转场重新生成偏好。
- 全站第一的默认概率为 10%；基础概率与补给的单次概率加成都由统一 `gameBalance` 模块管理，DEBUG 中可调整之后开始活动的基础参数。
- 幸运苹果使当次活动对应收藏的掉落概率增加 20 个百分点，苹果旅行便当使当次旅行遇见朋友的概率增加 15 个百分点，两者都封顶 100%。若基础收藏掉落率已经是 100% 或对应分类已经集齐，幸运苹果不可使用，也不会扣除。
- 明信片和百万直拍从当前未拥有集合中随机选取；全站第一按时间从 Dynamite 由旧到新领取，当前目录到 POWER，三类都不会再次抽到已拥有项。POWER 只是当前最新项，通用 schema 允许以后继续追加。
- “饼狗的收藏墙”只显示已获得的内容，新分类会在首次获得时解锁，收藏按时间新到旧排列。存档只保存拥有项，不保存目录总数、下一项索引或分类解锁列表，因此旧存档可直接识别以后新增的收藏。
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

素材处理脚本位于 `scripts/assets/`。明信片只从指定的 Bilibili Toy 归档生成 Web 衍生图，不使用生成图代替。房间唯一母版为 `resources/raw/travelling-bingo/generated/chan-chan-house-v2.png`（1098 × 1433），派生图为 `chan-chan-house-v2-768.webp` 与 `chan-chan-house-v2-1098.webp`。字体源文件位于 `resources/raw/travelling-bingo/fonts/`，公开页面只使用按字符集生成的 WOFF2 子集。

## 发布

推送到 `main` 后，GitHub Actions 执行校验、构建、站点组装和公开边界检查，然后部署 `_site/`。线上入口：

- [站点根首页](https://emmm1e3m.github.io/)
- [旅行饼狗](https://emmm1e3m.github.io/AllForSUXINHAO/TravellingBingo/)
