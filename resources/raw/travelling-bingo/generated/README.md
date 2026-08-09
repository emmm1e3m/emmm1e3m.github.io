# Demo 生成视觉来源

本目录保存“旅行饼狗”的房屋与角色透明母版；明信片、百万直拍和全站第一收藏均来自已记录的真实来源，不使用图像生成。

## 来源与生成方式

- `chan-chan-house-master.png`：用户提供的 1098×1433 RGBA 房间原图，是当前唯一房屋母版。网页派生只做等比缩放和无损 WebP 编码，完整保留画布、透明通道与原画风，不做裁切或重绘。
- 其余角色素材使用 OpenAI 内置 ImageGen，并按下列方式保存透明母版。
- `bingo-sprites-transparent-v2.png`：在四姿态饼狗参考图上编辑。提示词要点为“保留四种姿态、苹果头套、身份特征、顺序与画风；身体缩短约三分之一，头部略放大，四肢短圆，整体约 1.5 头高的团子比例”。生成时先使用纯色抠图背景，再移除背景得到当前透明母版。
- `bingo-walk-v2.png`：锁定苹果头套和白色垂耳身份，提示词要求“身体更小更短、四肢更细且必须完整、四肢交替、小芽轻微弹动”的四帧横向走路透明母版。
- `bingo-actions-v2.png`：锁定同一身份和头大身小比例，生成抱苹果篮、坐下、围围巾和蜷缩睡觉四种状态的横向透明母版。
- `bingo-refuse-v2.png`：锁定同一身份和头大身小比例，生成轻轻犹豫与困倦摇头两帧；情绪可爱自主，不生气也不受惩罚。
- `friend-atlas-v3.png`：同时参考开发纲要中的五组好友原图，以五格等宽纸卡统一课代饼、三好兔、心好兔、信号狗与饼哩饼哩的线条、比例和暖色纸张画风；每位角色均保留完整双手与双脚，不含文字或额外角色。

`*-chroma.png` 是本地蓝幕中间稿，已被 `.gitignore` 精确排除；透明母版通过内置图像技能的 `remove_chroma_key.py` 生成，参数为 `--auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`。网页构建只读取透明 PNG 母版，并逐格裁切、等比缩放到 512×512 单元。

## 网页派生

执行：

```powershell
npm run assets:build:demo
```

生成：

- `public/assets/game/chan-chan-house-v2-768.webp`
- `public/assets/game/chan-chan-house-v2-1098.webp`
- `public/assets/game/bingo-sprites-v2.webp`
- `public/assets/game/bingo-walk-v2.webp`（精确无损 WebP，4×1，每格 512×512）
- `public/assets/game/bingo-actions-v2.webp`（精确无损 WebP，4×1，每格 512×512）
- `public/assets/game/bingo-refuse-v2.webp`（精确无损 WebP，2×1，每格 512×512）
- `public/icons/favicon-32.png`
- `public/icons/apple-touch-icon-180.png`
- `public/icons/app-icon-{192,512}.png`
- `public/icons/app-icon-maskable-512.png`
- `public/data/demo-visuals.json`

房屋图以无损 WebP 保留透明通道和完整画布；动画图集在编码前会把完全透明像素的隐藏 RGB 清零，并启用 WebP `exact`，避免浏览器或查看器露出彩色条带。应用图标只从既有四态饼狗的 `idle` 帧机械裁切、缩放并铺到统一浅色底，不重新绘制角色。`demo-visuals.json` 同时锁定 PNG 母版、公开派生图与图标的尺寸、字节数、SHA-256 及处理方式。

好友图鉴执行 `npm run assets:build:friends`，生成 `public/assets/friends/*.webp` 与 `public/data/friends.json`。公开目录只保留适合奖励弹窗和收藏墙的 360×560 WebP，ImageGen 母版及提示词摘要留在受控资源目录中。

用户已确认所有素材均视为有授权。
