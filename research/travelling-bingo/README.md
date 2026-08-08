# 旅行饼狗资料库

本目录保存可复核的内容来源和素材清单，不作为网页运行时数据源。所有素材按用户确认的授权口径处理。

## 数据文件

| 文件 | 内容 |
|---|---|
| `data/million-shot-posters.source.json` | 最新 30 张严格口径百万直拍的帖子与原图来源 |
| `data/million-shot-posters.lock.json` | 实际下载尺寸、格式、字节数与 SHA-256 |
| `data/site-firsts.source.json` | 8 项全站第一的 BV 号、排名证据与原件策略 |
| `data/site-firsts.lock.json` | 8 个原件的格式与 SHA-256 |
| `data/postcards.source.json` | B 站活动页解析出的 473 条明信片候选元数据 |
| `data/postcards.duplicates.json` | 完整字节核验出的 4 组重复候选及 SHA-256 |
| `data/entities.json` | 苏新皓、TOP 登陆少年与饼狗的分层事实、来源和禁用表述 |

## 维护规则

- 来源清单保存稳定 ID、原始页面、原图 URL、抓取时间和授权口径。
- 锁定清单以实际解码结果和 SHA-256 为准，不盲信接口声明的文件尺寸或扩展名。
- 研究资料不能直接进入 GitHub Pages artifact；网页只读取人工审核后的 `public/data/` 目录。
- 微博动态、粉丝数、销量和互动量不作为稳定事实保存。
- 饼狗属于粉丝二创角色；创作者权利声明只能作为来源备注，不能替代独立法律确权。
