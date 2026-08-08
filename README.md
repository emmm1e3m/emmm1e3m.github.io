# emmm1e3m.github.io

本仓库托管 `emmm1e3m.github.io` 根首页、既有工具，以及粉丝向单机网页游戏“旅行饼狗”。

## 旅行饼狗

- 线上目标路径：`/AllForSUXINHAO/TravellingBingo/`
- 本地源码：`AllForSUXINHAO/TravellingBingo/`
- 原始纲要：`docs/specs/旅行饼狗开发纲要.md`
- 完整方案：`docs/旅行饼狗网页完整实现方案.md`
- 资料与来源：`research/travelling-bingo/`
- 原始授权素材：`resources/raw/travelling-bingo/`

根目录 `index.html` 只提供站点入口，不承载游戏代码。GitHub Pages 工作流仅发布 `_site/`，避免把研究资料、原图和开发脚本暴露到线上。

## 本地开发

需要 Node.js 24 与 npm 11。

```powershell
npm ci
npm run dev
```

常用命令：

```powershell
npm run verify
npm run build
npm run site:assemble
npm run site:verify
npm run test:e2e
```

`npm run site:assemble` 会把根首页、既有 `SUperView` / `SUperDanmaku` 与游戏构建产物组合到 `_site/`。

## 素材流水线

```powershell
npm run assets:download
npm run assets:build
npm run assets:download:site-firsts
npm run assets:build:site-firsts
npm run assets:build:postcards
npm run assets:build:demo
npm run assets:verify
```

微博百万直拍原图体积较大且由来源清单可复现，因此默认不纳入 Git；经转换的 WebP、来源清单和 SHA-256 锁定清单纳入版本控制。

## 发布

项目在 `feature/travelling-bingo` 分支开发并跟踪 `origin/main`。合并到 `main` 后，GitHub Actions 构建并只发布 `_site/`。仓库 Settings → Pages 的 Source 需要设为 **GitHub Actions**。
