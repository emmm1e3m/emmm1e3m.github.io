# 本地字体母版

此目录在本地保存用户提供并确认可用于本项目的字体母版：

- `可画乐融融.ttf`：标题与强调文字；
- `可画奶糖体.otf`：正文与小型 UI 文字。

字体母版体积较大，不进入仓库或 GitHub Pages。运行 `npm run assets:build:fonts` 会从当前界面源码与公开数据提取实际用字，生成 `public/assets/fonts/*.woff2` 子集及可核验清单。
