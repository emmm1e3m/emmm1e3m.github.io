# AI 工作笔记

## 已确认

- 游戏最终路径固定为 `/AllForSUXINHAO/TravellingBingo/`；仓库根首页只增加跳转入口，既有页面继续由站点组装脚本保留。
- 本地仓库已关联 `origin`，工作分支为 `feature/travelling-bingo`，基线为 `origin/main`；GitHub 推送、Pages 设置和线上验证仍未完成。
- 首版收藏目录为 **12 + 30 + 8**：12 张真实 Bilibili Toy 明信片、30 张百万直拍海报、8 项全站第一素材，共 50 项。
- 12 张明信片从用户指定的 Bilibili Toy 活动来源链中筛选，源数据来自已持久化的 473 条归档元数据；网页发布 480 / 960 两档同源 WebP。明信片没有使用 ImageGen，也没有用 CSS 或占位图伪造。
- 30 张百万直拍按“正文明确包含直拍及第 N 支百万单人视频”的严格规则选取，原图与 SHA-256 已锁定；网页发布 87 个多尺寸 WebP。
- 8 项全站第一均有网页素材；其中 5 个旧 `.jpg` 实为 HEIC tile-grid，已按真实格式保存并正确转换；网页发布 23 个多尺寸 WebP。
- ImageGen 只用于首版铲铲饼屋场景和饼狗角色。当前角色为 `bingo-sprites-v2.webp`：相较第一版缩短约三分之一，头身比更大、四肢更短圆，回应“身子太大太长、不够可爱”的反馈。
- 领域层、奖励、购买、72 分钟绝对计时、三类活动、收藏册、`.bingo` 导入导出、SHA-256 完整性、五击调试入口和调试操作均已写入代码并通过本地全链验收。
- 存档在预览前和确认采用前都会与当前目录做领域一致性校验；导入 attempt 序号阻止较慢旧文件覆盖新选择。
- 收藏墙已经纳入统一 modal 焦点管理；375×667 实测内容区 `356/503 px`，可滚动 147 px 到达最后一项。
- Workbox 只对真正内容哈希的 JS/CSS 省略 revision；53 个固定文件名 WebP 均带内容 revision，并由站点校验脚本回归检查。
- 项目叙事按用户确认口径：`信号灯`是确定的粉丝名；苏新皓是组合 C 位与唯一 ACE，并遭遇公司打压。这些内容作为项目确认事实进入资料和文案。

## 关键位置

- 完整实现说明：`docs/旅行饼狗网页完整实现方案.md`
- Web 应用：`AllForSUXINHAO/TravellingBingo/`
- 三类收藏目录：`AllForSUXINHAO/TravellingBingo/public/data/`
- Bilibili Toy 候选源数据：`research/travelling-bingo/data/postcards.source.json`
- 明信片复现脚本：`scripts/assets/build-demo-postcards.mjs`
- 领域状态机：`AllForSUXINHAO/TravellingBingo/src/domain/`
- `.bingo` 持久化：`AllForSUXINHAO/TravellingBingo/src/infrastructure/persistence/`
- 页面与房间：`AllForSUXINHAO/TravellingBingo/src/features/`
- 构建组装：`scripts/site/assemble-site.mjs`
- Pages 工作流：`.github/workflows/static.yml`

## 当前验证结论

- `format / lint / typecheck / unit / assets` 全部通过；Vitest 为 7 个文件、42 项测试。
- 生产构建、站点组装和站点边界校验通过；发布包只包含根入口、旧工具和新游戏。
- Playwright 桌面与 Pixel 7 主旅程通过，覆盖 DEBUG、领取真实海报、收藏墙、真实 `.bingo` 下载和重新上传；离线桌面测试通过，手机离线重复项按配置跳过。总计 7 项通过、1 项按设计跳过。
- 尚未完成的验证只剩 GitHub Actions 远端运行、Pages 部署和线上新旧路径回归。

## 下一步

1. 使用 GitHub 登录态推送分支，审核并合并到 `main`。
2. 在 GitHub Settings → Pages 将 Source 统一为 GitHub Actions，等待部署后验证最终 URL、根入口与既有站点路径。
