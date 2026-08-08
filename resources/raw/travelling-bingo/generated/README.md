# Demo 生成视觉来源

本目录只保存“旅行饼狗”首版 Demo 的房屋与角色母版；明信片、百万直拍和全站第一收藏均来自已记录的真实来源，不使用图像生成。

## 生成方式

- 模式：OpenAI 内置 ImageGen。
- `chan-chan-house-v1.png`：全新生成。提示词要点为“横向、高清、等距视角的两层铲铲饼屋；包含床、电脑、衣架、电子琴、唱片机、冰箱、明信片展示墙和出口；奶油纸张、苹果红、鼠尾草绿、温暖手绘质感；不含角色、文字和标志”。
- `bingo-sprites-transparent-v2.png`：在四姿态饼狗参考图上编辑。提示词要点为“保留四种姿态、苹果头套、身份特征、顺序与画风；身体缩短约三分之一，头部略放大，四肢短圆，整体约 1.5 头高的团子比例”。生成时先使用纯色抠图背景，再移除背景得到当前透明母版。

## 网页派生

执行：

```powershell
npm run assets:build:demo
```

生成：

- `public/assets/game/chan-chan-house-960.webp`
- `public/assets/game/chan-chan-house-1536.webp`
- `public/assets/game/bingo-sprites-v2.webp`
- `public/data/demo-visuals.json`

用户已确认所有素材均视为有授权。
