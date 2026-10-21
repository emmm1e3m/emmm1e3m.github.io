# 本仓库工作说明

- GitHub 仓库：https://github.com/emmm1e3m/emmm1e3m.github.io
- Pages：https://emmm1e3m.github.io/
- 本目录是独立 Git 仓库。先运行 git status、git remote -v，确认 origin 后再提交与推送。
- Git 认证由本仓库显式配置的 Windows Git Credential Manager 提供，凭据保存在系统凭据库；不要把令牌写入文件、URL 或提交。git ls-remote origin 可验证读取，git push --dry-run origin main 可验证写入。
- 推送 main 后 Pages 自动从根目录发布。
- 所有文本使用 UTF-8，代码注释使用中文。不新建无关项目目录。
- 本项目独立维护，不要将其它应用源码放入此目录。
