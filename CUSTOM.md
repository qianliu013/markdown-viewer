# Markdown Viewer 定制版

基于 simov/markdown-viewer 5.3，定制内容在 `custom` 分支。只在 Chrome 中使用和验证，不再跟上游同步。

## 定制内容

- **主题**：只保留 Lapis（默认）、GitHub、Purple 黑色、Phycat 天蓝四套，字体 FZYouSongJS（需本机安装，缺失时回退 Songti SC / serif；不分发字体）。外框 1000px，正文 18px、1.8 倍行高。其他主题和 Custom CSS 入口隐藏，旧选择自动迁移为 Lapis。
- **Front matter**：YAML / TOML 元数据作为可折叠代码块显示在正文顶部，按纯文本渲染。在 Content 中关闭 frontmatter 可隐藏；Raw 视图保留完整原文。
- **本地代码链接**：本地 Markdown 中指向本机源码的链接，点击后用 Cursor（默认）或 VS Code 打开；可在弹窗中切换为“浏览器”恢复原链接。支持相对路径、绝对路径、`file:///`，以及 `:行:列`、`#L行`、`#L行C列`、`#L行-L行`。扩展名白名单见 `content/editor-links.js`。只改页面中的链接，不改源文件，也不检查目标文件是否存在。
- **默认开关**：autoreload、emoji、mathjax、mermaid、syntax、frontmatter 默认开启，toc 默认关闭。已有安装保留原设置，点弹窗的 Defaults 或手动切换后生效。
- **加载可靠性**：正文没有隐藏门槛，编译期间显示原文；编译失败或 10 秒无响应时显示提示和原文，之后编译成功（含自动刷新）会恢复正常渲染。后台读完设置后才处理页面事件；Mermaid / MathJax 出错不影响正文。

## 安装（Chrome）

```sh
sh build/prepare-custom.sh
node --test test/*.test.cjs
```

准备脚本下载官方 5.3 发布包并校验 SHA-256，只取其中的 vendor 依赖和原主题，并生成 `manifest.json`。也可以传入已下载 zip 的绝对路径离线准备。

1. 在 `chrome://extensions` 开启开发者模式，“加载已解压的扩展程序”，选择仓库根目录。
2. 在详情页开启“允许访问文件网址”。
3. 停用商店版 Markdown Viewer。

远程文件需要在 Advanced Options → Origins 中单独授权。

## 修改之后

- **JS**：在扩展页点“重新加载”，等一两秒再刷新 Markdown 页面。刚重新加载的瞬间 Chrome 可能还没把页面事件交给扩展，那一页会显示原始文本，再刷新一次即可。已打开的旧页面不会自动换成新脚本。
- **主题**：`custom-themes/` 是源文件，修改后执行 `sh build/custom-themes.sh` 并刷新页面。
- **manifest**：修改 `manifest.chrome.json` 后执行 `cp manifest.chrome.json manifest.json`。
- `vendor/`、`themes/`、`manifest.json` 是生成物，不提交。

## 测试

- `node --test test/*.test.cjs`：后台、渲染流程、元数据、编辑器链接等，浏览器 API 为模拟。需要先运行准备脚本。
- 浏览器场景：`python3 -m http.server 8765 --bind 127.0.0.1`，打开 `http://127.0.0.1:8765/test/browser.html`，点 Run checks。

## 已知取舍

- Mermaid 和 MathJax 默认开启后，每页多注入约 4MB 脚本，打开时显示原文的时间从约 30ms 增加到约 90ms（本机实测）。
- MathJax 会把同一行内两个 `$` 之间的内容当作公式：正文里直接写的 `$HOME 和 $PATH` 会被渲染成公式，写在反引号里不受影响。
- emoji 短码（如 `:smile:`）的图片从 cdn.jsdelivr.net 加载，离线时不显示。
- 自动刷新对本地文件每秒读取一次。
