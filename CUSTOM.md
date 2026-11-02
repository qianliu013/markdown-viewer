# Markdown Viewer 定制版

基于 simov/markdown-viewer 5.3。`main` 跟踪上游，定制内容维护在 `custom` 分支。

## 阅读体验

- 主题菜单仅显示 Lapis、GitHub、Purple 黑色、Phycat 天蓝四套 FZYouSongJS 版本，默认 Lapis。
- 原主题构建脚本和资源保留，但入口隐藏。旧主题选择迁移为 Lapis。
- 字体使用本机安装的 FZYouSongJS，缺失时回退到 Songti SC / serif；不分发字体文件。
- 默认外框 1000px，正文 18px、1.8 倍行高。Content Width 选择 auto 使用该宽度。
- YAML/TOML front matter 默认显示在正文顶部，可点击折叠；在 Content 中关闭 frontmatter 可隐藏。
- 元数据原文作为代码展示，不执行 HTML，不修改 Markdown 源文件。Raw 视图保留完整原文。
- 折叠状态在当前页面切换主题或源码时保留，刷新后默认展开。

## 本地安装（Chrome）

在仓库根目录执行：

```sh
sh build/prepare-custom.sh
node --test test/*.test.cjs
```

准备脚本下载官方 5.3 发布包并校验固定 SHA-256，仅复用其中的 vendor 依赖和原主题。
本仓库中的 background、content、popup、options 代码和四套定制主题作为实际运行版本。
该路径无需重新编译上游旧版 Sass 等依赖；也可传入已有官方 zip 的绝对路径离线准备。
若需要从源码重建全部依赖，保留上游命令 `sh build/package.sh chrome`，完成后也会复制定制主题。

1. 在 Chrome 扩展管理页面开启开发者模式，选择“加载已解压的扩展程序”。
2. 选择本仓库根目录（生成的 manifest.json 在这里）。
3. 在“Markdown Viewer Custom”的详情页开启“允许访问文件网址”。
4. 停用原版 Markdown Viewer，避免同时处理同一个文件；刷新 Markdown 页面。

定制版使用独立扩展身份，不会自动继承商店版的网站权限。远程文件如有需要，在 Origins 中单独授权。
无需上传 CSS。正式安装在用户 Chrome 中的操作需要手动完成。

## 修改与同步

- 四套可编辑样式位于 `custom-themes/`，保留了原主题来源和许可证。`themes/` 是生成目录。
- 修改主题后执行 `sh build/custom-themes.sh`，再刷新 Markdown 页面。
- 修改插件 JavaScript 后，在 Chrome 扩展管理页面点击重新加载，再刷新文档。
- `vendor/`、`themes/`、`manifest.json` 不提交；在新机器上运行准备脚本即可生成。

```sh
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch custom
git merge main
node --test test/*.test.cjs
```

准备脚本固定使用 5.3 依赖；同步上游如果涉及依赖更新，需一并评估发布包版本、校验值和构建脚本，不能只合并代码。
定制版不会从 Chrome 商店自动升级。

## 加载可靠性与回归验证

- 后台在设置读取及迁移完成后才响应编译、页面检测；事件监听器仍同步注册。
- 注入按“参数 → CSS → 脚本”顺序完成，并绑定检测到的文档，避免导航后注入到另一页。
- 编译期间保留可读原文；编译失败或 10 秒未返回时显示提示和完整原文。
- 正文可见性不再依赖 Mermaid / MathJax 成功，相关等待有上限。
- 保存设置完成后才通知刷新；自动重载忽略旧编译结果，并能从空文件恢复。

运行 `node --test test/*.test.cjs`：34 项检查覆盖完整后台入口、实际三个编译器、异步状态边界及元数据。
需要先运行准备脚本生成 vendor 依赖。浏览器 API 在这些测试中是模拟接口。

运行 `python3 -m http.server 8765 --bind 127.0.0.1`，打开
`http://127.0.0.1:8765/test/browser.html`，点击 Run checks：
7 组浏览器场景使用实际 Mithril、Prism、markdown-it 和正文脚本，覆盖延迟编译、元数据转义与折叠、
Raw 往返、四套主题切换、空文件、仅元数据、隐藏元数据、编译失败和错误 Mermaid。
测试通过后停止临时服务器。

2026-11-02：上述检查均通过。它们不代替已安装 Chrome 扩展的实测；
真实 `chrome.*` API、服务进程挂起/唤醒及本地文件权限仍需在允许的浏览器环境验证。
本次工具策略不允许访问 `file://` 和扩展管理页面，因此没有把此部分标记为通过。

5.3.3 补充：修复异常 origins 配置导致初始化失败；检测器遇到缺失配置时停止检测。
扩展重新加载后，旧页面的自动刷新遇到连接失效会停止轮询，滚动保存失败不影响阅读；
编译消息同步抛错会立即显示原文。新增 4 项测试在修复前失败，修复后全部通过。
截图中的 detect.js 错误没有时间信息，尚不能确定是历史记录还是 5.3.2 的新错误。
重新加载扩展后还需要刷新已打开的 Markdown 页面，才能替换其中的旧脚本。

5.3.3 第二轮检查补充：缓存正文重绘需要的资源 URL；代码高亮与公式加载处理连接失效，
后台依赖注入绑定请求文档并返回失败；自动刷新只保留一个在途请求，HTTP 失败保留原文，
缓存参数不破坏已有查询及锚点；拒绝可选权限和无接收脚本的页面不产生未处理异常。
本轮新增 8 项测试，修复前全部失败，修复后总计 32 项通过。

最后补查配置迁移与检测回调：空主题回退到默认主题；无效路径正则跳过匹配，
不在 Chrome 异步回调中抛出异常。这两项先复现后修复，总计 34 项自动检查通过。
本轮也重新运行了 7 组浏览器渲染场景，全部通过；Chrome 接口仍是模拟边界。
