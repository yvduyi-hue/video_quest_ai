# VideoQuest AI UI/UX 改造方案（勘察总结）

> **文档状态**：勘察完成，等待确认，尚未开始改造  
> **日期**：2026-10-23  
> **范围**：现有 Electron + Vue 项目全量 UI/UX 升级  
> **原则**：只读勘察；不复制示例代码；不全局替换 Element Plus；不删除业务功能；不升级依赖；不执行 Git 写操作。

---

## 一、项目现状

### 1.1 技术栈

| 项目 | 实际值 |
|---|---|
| Vue | 3.5.44（JavaScript，无 TypeScript） |
| Element Plus | 2.14.7（全量引入，中文 locale） |
| Vue Router | 5.4.0（hash 模式，`file://` 必需） |
| Vite / electron-vite | 8.3.5 / 6.0.0 |
| Electron | 44.9.3（无边框窗口） |
| Phaser | 4.2.1（弹珠打靶、拼图连线） |
| SQLite | sqlite3 6.0.1（本地 `userData/video_quest.db`） |
| 字体 | `mi_normal.ttf`（MiSans Normal），约 8 MB |
| 测试 | 无 test 脚本、无单测/E2E |

入口与配置：[package.json](../package.json)、[electron.vite.config.mjs](../electron.vite.config.mjs)、[main.js](../src/renderer/src/main.js)、[index.html](../src/renderer/index.html)。

### 1.2 启动状态

- **开发态正常**：Vite `127.0.0.1:5173` 存活；Electron 主窗口 `VQAI` 响应正常。
- `/src/main.js`、`App.vue` 及 10 个主要视图模块请求均返回 **200**，未发现编译错误。
- **生产构建未验证**：`out/` 下只有 `main/`、`preload/`，没有 `out/renderer/`。
- 环境侧问题：当前 PowerShell 禁止执行 `npm.ps1`，需用 `npm.cmd` 或 `node` 调用；这不是项目代码问题。

### 1.3 路由与页面结构

```text
App.vue
├─ TitleBar（非 /main 路由显示，40px）
├─ /login                LoginView          登录
├─ /settings             SettingsView       首次启动 Polyv 凭证设置
├─ /model                ModelView          AI 模型设置
├─ /register             RegisterView       注册
├─ /player               PlayerView         播放 + 大纲 + 到点互动
│   └─ PlayerQuizOverlay（Phaser 小游戏浮层）
├─ /game/marble          MarbleShooterView  弹珠打靶
├─ /game/match           PuzzleMatchView    拼图连线
└─ /main                 MainView           主壳（requiresAuth）
    ├─ /main/video       VideoManageView    默认子路由
    ├─ /main/quiz        QuizBankView
    ├─ /main/level       LevelPlayView
    └─ /main/setting     SystemSettingView
```

启动重定向：

- 无 `config.json` → `/settings`
- 有 `config.json` → `/login`（自动登录成功则 `/main`）
- 未登录访问 `requiresAuth` 路由 → `/login`
- 已登录访问 `/login` → `/main`

关键实现：

- 路由集中写在 [main.js](../src/renderer/src/main.js)，无独立 router 文件。
- `/player`、`/game/*` 为顶层路由，不继承 `/main` 侧栏。
- [App.vue](../src/renderer/src/App.vue) 用 `topLevelKey` 缓存一级路由，`/main` 子路由切换不会重建 MainView。

### 1.4 页面职责与业务数据

| 页面 | 主要职责 | 主要调用 | 状态/传参 |
|---|---|---|---|
| [LoginView.vue](../src/renderer/src/components/LoginView.vue) | 账号密码登录、自动登录 | `loginUser`、`readFile/saveConfig`、`userStore` | 成功后写 userStore，跳 `/main` |
| [RegisterView.vue](../src/renderer/src/components/RegisterView.vue) | 注册并绑定当前 Polyv 凭证 | `getPolyvCredentials`、`registerUser`（主进程 `addCate` + SQLite） | 成功后回 `/login` |
| [SettingsView.vue](../src/renderer/src/components/SettingsView.vue) | 首次配置 Polyv 凭证 | `polyvEndpoint('userSpaceInfo')`、`saveConfig` | 成功后 `/model` |
| [ModelView.vue](../src/renderer/src/components/ModelView.vue) | 首次配置 AI 模型 | `request` POST OpenAI 格式、`saveConfig` | 成功后 `/login` |
| [MainView.vue](../src/renderer/src/components/MainView.vue) | 主壳、导航、用户菜单、窗口控制 | `userStore`、`logoutUser`、窗口 IPC | `el-menu router`；退出清 autoLogin |
| [VideoManageView.vue](../src/renderer/src/components/VideoManageView.vue) | 文件夹/视频浏览、上传、编辑、移动、删除、详情、播放 | `getUserCateContent`、`searchVideo`、`getVideoInfo`、`addCate`、`deleteCata`、`delVideos`、`updateVideoInfo`、`changeCata`、`smartSubtitleEnsure`、`videoOutlineCoursewareList`、`uploadStore` | 面包屑本地数组；播放跳 `/player?vid&title&cover` |
| [QuizBankView.vue](../src/renderer/src/components/QuizBankView.vue) | 题目列表、筛选、分页、CRUD、按大纲 AI 生成 | `quizList`、`quizOutlineVideos`、`quizCreateManual`、`quizUpdate`、`quizDelete`、`quizGenerate` | 本地筛选/分页/展开 |
| [LevelPlayView.vue](../src/renderer/src/components/LevelPlayView.vue) | 数据看板、错题本、闯关历史、错题专项、开局配置 | `gameStats`、`wrongBookList/Delete/Clear`、`gameHistory/Clear`、`quizOutlineVideos` | 跳游戏 query 传 `mode/count/difficulty/vid/scope` |
| [SystemSettingView.vue](../src/renderer/src/components/SystemSettingView.vue) | 登录后修改 AI 模型配置 | `readFile`、`request` 验证、`saveConfig` | 仅修改后验证，保留额外字段 |
| [PlayerView.vue](../src/renderer/src/components/PlayerView.vue) | Polyv 播放、大纲高亮/跟随、到点互动 | `videoOutlineGet`、`quizList`、500ms 轮询播放时间 | query `vid/title/cover/t` |
| [MarbleShooterView.vue](../src/renderer/src/components/MarbleShooterView.vue) / [PuzzleMatchView.vue](../src/renderer/src/components/PuzzleMatchView.vue) | 小游戏答题、HUD、解析、结算 | `quizList`、`wrongBookList`、`gameRecordAnswer` | query 传模式/数量/难度/大纲/错题范围 |
| [PlayerQuizOverlay.vue](../src/renderer/src/components/PlayerQuizOverlay.vue) | 播放页互动浮层 | 复用两个 Phaser 场景、`gameRecordAnswer` | 父组件传题目，`done` 回传 |

### 1.5 数据流与状态

```text
渲染层 View
  └─ window.api（preload contextBridge）
       ├─ polyv:endpoint ── PolyvClient 签名 ── 保利威 OpenAPI
       ├─ net:request    ── 主进程 axios ── OpenAI 兼容接口
       ├─ quiz:* / game:* / video-outline:* ── SQLite
       └─ file:read/write / config:save ── userData/config.json
```

- 状态管理：手写 reactive 单例，无 Pinia/Vuex。
- [userStore.js](../src/renderer/src/stores/userStore.js)：登录用户。
- [uploadStore.js](../src/renderer/src/stores/uploadStore.js)：上传任务、进度、鉴权刷新，跨路由保活。
- 其余均为组件内 `ref/reactive`。

### 1.6 当前 UI 现状

- 三层窗口 chrome：全局 [TitleBar.vue](../src/renderer/src/components/TitleBar.vue) 40px（非 `/main`）+ [MainView.vue](../src/renderer/src/components/MainView.vue) 56px AppBar + 页面自身头部。
- 左侧 `el-menu` 固定 200px，无图标；各页面自行控制 `height:100%` 和滚动。
- 白底黑字，Element Plus 主色 `#0071fe`，圆角 8px 为主，阴影仅 hover 时出现。
- 文件夹网格 `minmax(140px, 1fr)`，视频网格 `minmax(200px, 1fr)`。
- 视频/题库页无页面标题；关卡页自带 `h2`；设置页用欢迎语，头部不统一。
- 大量硬编码颜色：关卡页 `#303133/#909399`，游戏 HUD `#1e2633/#ffd36b`，Phaser 场景 `0x0071fe`。
- 全局隐藏滚动条；对话框宽度写死 520/640/720/780px。

### 1.7 既有问题（改造前已存在，与改版风险分开）

| # | 问题 | 本次是否处理 |
|---|---|---|
| E1 | `@element-plus/icons-vue` 未直接写入 package.json（靠 Element Plus 传递依赖） | 建议补直接依赖，需确认，不算升级 |
| E2 | 设计参考图放在 `public/images`，会被打进安装包 | 是，移到 `design/reference/` |
| E3 | Logo 使用 371KB JPG + `scale(2.2)` 裁切，三处重复 | 是，改标准品牌资源 |
| E4 | 字体只有 MiSans Normal 一个字重 | 先保留，标题字重作为验收项 |
| E5 | 每次进入 `/main` 强制窗口 1200×700，返回播放页会重置窗口 | 是，仅首次会话设置 |
| E6 | 全局隐藏滚动条，长列表无滚动提示 | 是，改细滚动条 |
| E7 | 播放器初始化 300ms 与路由动画 250ms 强耦合 | 是，统一 motion token 并验证 |
| E8 | TitleBar 与 MainView 各有一套窗口控制 | 是，抽公共组件 |
| E9 | 固定宽度对话框在 600px 窗口下溢出 | 是，响应式宽度 |
| E10 | 页面头部、间距、颜色不统一 | 是 |
| E11 | 无骨架屏、无统一空状态 | 是 |
| E12 | 无测试、README 仍为模板 | 不在本次 UI 范围 |
| E13 | 自动登录明文保存密码到 config.json | 不在本次范围，建议后续接钥匙串 |
| E14 | `savePolyvCredentials` IPC 存在但无 UI 使用 | 不擅自新增，需确认 |

---

## 二、参考截图分析

### 2.1 视觉语言

- 企业级教育 SaaS：干净、留白充足、轻边框、弱阴影、蓝色唯一强强调色。
- 主蓝约 `#155EEF`（截图采样 `#165EF0`）；导航浅蓝 `#F0F2FF`；画布 `#FAF9FF`；表面纯白；正文 `#101828/#475467`；边框 `#E4E7EC`；辅助紫 `#7A5AF8`、成功绿 `#12B76A`。
- 侧栏 240–260px、顶栏 64px、内容 24px 内边距；4 列文件夹 + 3 列视频。
- 卡片：白底、1px 边框、12–16px 圆角、几乎无阴影；hover 轻微上浮。
- 图标：线性图标 + 40×40 浅色 icon tile；标签为浅底深字胶囊。
- 字体：Inter/PingFang 风格，12/13/14/16/18/28 层级，标题 semibold。

### 2.2 可借鉴 / 需重设计 / 不采纳

| 截图元素 | 判断 | 项目落地 |
|---|---|---|
| 侧栏品牌、导航胶囊、底部用户条 | 直接借鉴 | `AppSidebar`，保留 4 个真实入口 |
| 顶部搜索、AI 助手、通知、用户 | 部分借鉴 | 只保留真实动作：上传任务、用户菜单、窗口控制 |
| 页面标题 + 徽标 + 副标题 | 直接借鉴 | `PageHeader`，徽标用真实数量 |
| 4 个数据卡 | 借鉴结构，替换数据 | 当前目录视频/总时长、字幕状态、上传任务等真实指标 |
| 文件夹卡片 | 借鉴 + 补交互 | `FolderCard`：点击进入、菜单删除、真实视频数 |
| 视频卡片 | 借鉴 + 业务映射 | 状态、时长、非课件、字幕、编辑/移动/删除、详情/播放 |
| 筛选工具栏 + 网格/列表切换 | 借鉴 | 本地标题搜索、状态筛选、排序、视图切换 |
| 新建文件夹弹窗 | 直接借鉴 | 自定义 `FolderCreateDialog` 替换 `ElMessageBox.prompt` |
| 工作台 / 学习分析 | 不采纳 | 无对应路由，不新增空页面 |
| 企业工作台 / 认证教师 | 不采纳 | 不伪造角色，使用真实账号信息 |
| 编辑关卡 / 进入画布 / 立即配置 | 不采纳 | 项目无此功能，改为“查看详情/播放” |
| 存储容量 / 处理管道 / AI 分析 68% | 不采纳 | 无真实数据源 |
| 封面照片、文件夹装饰图 | 不当作素材 | 用 Polyv 封面 + SVG fallback |

### 2.3 改造优先级

| 优先级 | 范围 | 理由 |
|---|---|---|
| P0 | 设计底座 + 应用壳（侧栏/顶栏/窗口控制） | 所有主界面共同基础，先统一避免返工 |
| P0 | 视频管理 | 参考图覆盖最完整、使用频率最高、业务动作最多 |
| P1 | 互动题库 | 核心内容生产页，当前信息密度高但视觉最弱 |
| P1 | 关卡游玩 | 看板 + 游戏入口，适合套用参考卡片语言 |
| P1 | 登录/注册/初始化/系统设置 | 首次体验与配置闭环，改造独立、风险相对低 |
| P2 | 播放器 + 大纲 + 互动浮层 | 强业务、强时序，最后动以降低回归风险 |
| P2 | 两个 Phaser 小游戏 HUD/结算 | 玩法逻辑不动，只改 DOM 覆盖层 |
| 横切 | 响应式、动效、空状态、无障碍、打包验收 | 每阶段收口 |

---

## 三、参考组件评估

### 3.1 结论

- `VideoQuest-Vue-Components` 没有 `package.json`、构建配置、测试；组件为 TypeScript + `defineModel`，demo 使用静态数据和空函数。
- **正式可复用的只有视觉层**；业务事件、表单能力、键盘可访问性不足。
- **不复制其 `src/` 目录**，不新增第二套 `Vq*` 组件，避免双设计系统。
- 只吸收 `tokens.css` 的设计语言和 demo 的版式，统一落到 Element Plus 主题变量 + 项目自有布局/卡片组件。

### 3.2 关键组件判断

| 参考组件 | 差距 | 结论 |
|---|---|---|
| `VqButton` | 无 danger/plain/link/size/图标-only | 不直接复用，借鉴高度/圆角/hover |
| `VqInput` | 无 clearable、字数限制、错误态、form 集成 | 保留 `el-input` + 主题 |
| `VqPassword` | 无 clearable、autocomplete、错误态 | 保留 `el-input show-password` |
| `VqCheckbox` | 与 `el-checkbox` 重复 | 保留 Element Plus |
| `VqLink` | 无 href、无路由语义 | 保留 `el-button link` |
| `VqSearchBar` | 无 clearable、无回车事件 | 借鉴视觉 |
| `VqSelect` | 无键盘导航、无点击外部关闭、无 teleport、无 filterable | **明确拒绝替换 `el-select`** |
| `VqIcon` | 仅 12 个图标，无 aria | 用 Element Plus 图标 + 少量品牌 SVG |
| `VqNavItem` | `<div>` 无 router-link/aria/键盘 | 借鉴视觉，新建 `SidebarNavItem` |
| `VqUserPill` | 无点击/下拉/退出 | 借鉴视觉，新建 `UserMenu` |
| `VqFolderCard` | 无进入文件夹、无删除、无图标 | 新建 `FolderCard` |
| `VqVideoCard` | 只有 3 种状态，无 fallback、无点击、无字幕/非课件 | 新建 `VideoCard` |
| `VqBrandLogo` | 占位 SVG | 用真实 logo 新建 |
| `tokens.css` | 仅 23 行，缺少大量 token | 扩展为正式 token，不原样复制 |
| `demo/Login.vue` | 微信/GitHub/高校登录、空函数 | 仅布局参考 |
| `demo/VideoManage.vue` | 静态数组、空函数 | 仅布局参考 |

---

## 四、目标设计规范

### 4.1 颜色

| Token | 值 | 用途 |
|---|---|---|
| `--vq-primary` | `#155EEF` | 主按钮、链接、选中态 |
| `--vq-primary-hover` | `#134EC4` | hover |
| `--vq-primary-active` | `#0F3EA1` | active |
| `--vq-primary-light` | `#F0F4FE` | 导航选中、浅色按钮底 |
| `--vq-primary-tint` | `#F5F8FF` | 局部浅蓝 |
| `--vq-success` | `#12B76A` | 成功、已发布 |
| `--vq-warning` | `#F79009` | 生成中、非课件 |
| `--vq-danger` | `#F04438` | 删除、错误 |
| `--vq-purple` | `#7A5AF8` | AI/智能功能 |
| `--vq-text-title` | `#101828` | 页面/卡片标题 |
| `--vq-text-main` | `#344054` | 正文 |
| `--vq-text-secondary` | `#475467` | 说明、meta |
| `--vq-text-tertiary` | `#667085` | 辅助信息 |
| `--vq-text-placeholder` | `#98A2B3` | placeholder |
| `--vq-bg-page` | `#FAFAFC` | 主内容画布（截图实测 `#FAF9FF`） |
| `--vq-bg-surface` | `#FFFFFF` | 侧栏、顶栏、卡片 |
| `--vq-bg-subtle` | `#F2F4F7` | 信息块 |
| `--vq-bg-hover` | `#F9FAFB` | hover |
| `--vq-border` | `#E4E7EC` | 卡片/分隔 |
| `--vq-border-light` | `#EAECF0` | 轻分隔 |
| `--vq-border-strong` | `#D0D5DD` | 输入框 |
| `--vq-focus-ring` | `0 0 0 3px rgba(21,94,239,.16)` | 键盘焦点 |

状态底色：成功 `#ECFDF3/#027A48`；警告 `#FFFAEB/#B54708`；错误 `#FEF3F2/#B42318`；紫色 `#F4F3FF/#5925DC`；信息 `#F2F4F7/#344054`；蓝色 `#EFF4FF/#175CD3`。

Element Plus 映射：修改 [index.scss](../src/renderer/src/styles/element/index.scss) 的 `$colors` 主色为 `#155EEF`，覆盖 `--el-color-primary-light-3/5/7/8/9`、`dark-2`、背景/文字/边框/圆角/字体/阴影变量。

### 4.2 字体

- 字族：`mi_normal`（中文）+ `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`。
- 数字使用 `font-variant-numeric: tabular-nums`。

| 用途 | 字号/行高 | 字重 |
|---|---|---|
| 页面标题 | 28/36（窄窗口 24/32） | 600 |
| 区块标题 | 18/26 | 600 |
| 卡片/弹窗标题 | 16/24 | 600 |
| 正文、导航 | 14/22 | 400/500 |
| meta、标签 | 13/20 | 500 |
| 辅助说明 | 12/18 | 400 |
| 徽标、eyebrow | 11/16，字距 0.02em | 500 |

说明：当前只有一个 Normal 字重，600 由浏览器合成；若验收不达标，再确认是否补 MiSans Medium/Semibold。

### 4.3 间距、圆角、阴影、动效

| 类别 | 规范 |
|---|---|
| 基础栅格 | 4px；常用 8/12/16/20/24/28/32/40 |
| 页面内边距 | 24px 28px；窄窗口 16px 20px |
| 区块间距 | 28–32px；卡片网格 16–20px |
| 卡片内边距 | 16–20px |
| 控件高度 | 输入 40px；按钮 36px（大 40px）；导航项 42px；顶栏 64px；侧栏 240px |
| 图标底 | 40×40，圆角 10；统计卡 44×44 |
| 圆角 | 6 标签/小控件、8 输入、10 按钮、12 卡片、16 弹窗/封面、999 胶囊 |
| 阴影 | xs `0 1px 2px rgba(16,24,40,.05)`；sm `0 2px 6px rgba(16,24,40,.06)`；md `0 8px 24px rgba(16,24,40,.08)`；lg `0 16px 40px rgba(16,24,40,.12)` |
| 动效 | hover 160ms、路由 200ms、弹窗 240ms；`cubic-bezier(.2,.8,.2,1)`；减少动效模式降级 |

### 4.4 布局与响应式

```text
┌──────────────┬────────────────────────────────────────────────────┐
│ Brand 240px  │ 页面标题 + 徽标 + 副标题     [上传任务] [用户] [_][□][×] │ 64px
│              ├────────────────────────────────────────────────────┤
│ 视频管理     │ 数据概览（4 张真实指标卡）                          │
│ 互动题库     │ 我的文件夹（4 列）                                  │
│ 关卡游玩     │ 视频（筛选栏 + 3 列视频卡）                          │
│ 系统设置     │                                                    │
│              │                                                    │
│ 用户/退出    │                                                    │
└──────────────┴────────────────────────────────────────────────────┘
```

| 窗口宽度 | 侧栏 | 文件夹列 | 视频列 | 其他 |
|---|---|---|---|---|
| ≥1440 | 248px | 4 | 3 | 完整工具栏 |
| 1200–1439（默认 1200） | 240px | 4 | 3 | 完整工具栏 |
| 1024–1199 | 220px | 3 | 2 | 工具栏可换行 |
| 900–1023 | 72px 图标栏 | 2 | 2 | 文字标签隐藏，tooltip 补全 |
| <900 | 72px | 2 | 1 | 弹窗 `min(92vw, 原宽度)` |
| <720 | 72px | 1 | 1 | 顶栏压缩，次要动作收进菜单 |

- 高度 <760px：页面上下 padding 降到 16px，统计卡压到 76px，隐藏副标题。
- 主内容改为“整页滚动”，减少双滚动条；播放器页保持固定高度。
- 弹窗宽度 `min(设计宽度, calc(100vw - 48px))`；抽屉 `min(设计宽度, 92vw)`。

---

## 五、页面改造蓝图

| 页面 | 目标结构 | 保留业务 | 明确不做 |
|---|---|---|---|
| 应用壳 | 240px 侧栏（品牌、4 项导航、底部用户）+ 64px 顶栏（上传任务、用户、窗口控制） | 路由、退出、窗口 IPC、上传任务保活 | 搜索、AI 助手、通知、假工作台 |
| 视频管理 | 页面头 + 4 指标卡 + 文件夹区 + 视频筛选/网格 + 4 个弹窗 + 上传任务面板 | 全部 CRUD、字幕同步、非课件标记、详情、播放 | 存储容量/处理管道/编辑关卡/进入画布 |
| 互动题库 | 页面头 + 双 CTA + 筛选卡 + 题目行卡片 + 分页 + 两个弹窗 | 筛选/分页/展开/CRUD/AI 生成 | 假统计、假来源 |
| 关卡游玩 | 页面头 + 4 真实统计卡 + 操作按钮 + 2 张游戏卡 + 开局弹窗 + 两个抽屉 | 错题本、历史、错题专项、开局参数 | 假玩法、假排行榜 |
| 登录 | 左侧品牌叙事区 + 右侧 400px 登录卡 | 账号密码、自动登录、返回设置、注册 | 微信/GitHub/高校登录、忘记密码 |
| 注册 | 单卡 420px + Polyv 绑定说明 | 账号/密码/昵称、绑定提示 | 确认密码、验证码等新业务 |
| Polyv / 模型设置 | 2 步向导壳（步骤条 + 右侧表单卡） | 验证、保存、跳转、URL 规整 | 新字段、新步骤 |
| 系统设置 | 单张 640px 卡片，模型配置 | 加载、验证、保存、保留额外字段 | 新增 Polyv 凭证编辑 |
| 播放器 | 深色 16:9 舞台 + 360px 大纲栏 + 互动浮层 | 播放、seek、大纲高亮/跟随、开关、答题回退 | 新播放器、新题源 |
| 小游戏 | 深色画布 + 玻璃 HUD + 玻璃题干 + 白色结算卡 | 全部玩法/事件/记录 | 改 Phaser 玩法逻辑 |

---

## 六、参考组件与现有页面对应表

| 参考组件 | 现有对应 | 决策 |
|---|---|---|
| `tokens.css` | [base.css](../src/renderer/src/assets/base.css) + [index.scss](../src/renderer/src/styles/element/index.scss) | 扩展合并，不原样复制 |
| `VqBrandLogo` | MainView/Login/Register 的 logo | 新建 `BrandLogo`，用正式 SVG/PNG |
| `VqButton` | 全项目 `el-button` | 保留 Element Plus，改主题 |
| `VqInput` | 登录/设置/模型/题库表单 | 保留 `el-input` |
| `VqPassword` | 密码输入 | 保留 `el-input show-password` |
| `VqCheckbox` | 自动登录 | 保留 `el-checkbox` |
| `VqLink` | 返回设置/登录/注册链接 | 保留 `el-button link` |
| `VqSearchBar` | 视频/题库筛选搜索 | 保留 `el-input` + 前缀图标 |
| `VqSelect` | 题库/关卡/移动分类下拉 | 保留 `el-select`，不替换 |
| `VqNavItem` | MainView `el-menu-item` | 新建 `SidebarNavItem` |
| `VqUserPill` | MainView 用户下拉 | 新建 `UserMenu` |
| `VqFolderCard` | 视频管理文件夹卡 | 新建 `FolderCard` |
| `VqVideoCard` | 视频管理视频卡 | 新建 `VideoCard` |
| `VqIcon` | `@element-plus/icons-vue` | 保留 EP，仅补品牌/空状态 SVG |
| `demo/Login.vue` | LoginView | 仅布局参考 |
| `demo/VideoManage.vue` | VideoManageView | 仅布局参考 |

---

## 七、组件清单

### 7.1 复用

- Element Plus：`el-input`、`el-button`、`el-form`、`el-dialog`、`el-drawer`、`el-select`、`el-table`、`el-tree`、`el-pagination`、`el-tag`、`el-avatar`、`el-dropdown`、`el-image`、`el-progress`、`el-switch`、`el-slider`、`el-radio`、`el-checkbox`、`el-breadcrumb`、`el-descriptions`、`el-empty`、`el-result`、`v-loading`、`ElMessage`、`ElMessageBox`。
- 现有状态：`userStore`、`uploadStore`。
- 现有能力：全部 IPC、Polyv 播放器集成、Phaser 场景、SQLite 数据结构。

### 7.2 改造（保留脚本逻辑，重写模板/样式）

[MainView.vue](../src/renderer/src/components/MainView.vue)、[TitleBar.vue](../src/renderer/src/components/TitleBar.vue)、[LoginView.vue](../src/renderer/src/components/LoginView.vue)、[RegisterView.vue](../src/renderer/src/components/RegisterView.vue)、[SettingsView.vue](../src/renderer/src/components/SettingsView.vue)、[ModelView.vue](../src/renderer/src/components/ModelView.vue)、[SystemSettingView.vue](../src/renderer/src/components/SystemSettingView.vue)、[VideoManageView.vue](../src/renderer/src/components/VideoManageView.vue)、[QuizBankView.vue](../src/renderer/src/components/QuizBankView.vue)、[LevelPlayView.vue](../src/renderer/src/components/LevelPlayView.vue)、[PlayerView.vue](../src/renderer/src/components/PlayerView.vue)、[PlayerQuizOverlay.vue](../src/renderer/src/components/PlayerQuizOverlay.vue)、[MarbleShooterView.vue](../src/renderer/src/components/MarbleShooterView.vue)、[PuzzleMatchView.vue](../src/renderer/src/components/PuzzleMatchView.vue)。

### 7.3 新建（首批必需）

| 目录 | 组件 | 职责 |
|---|---|---|
| `components/layout/` | `AppSidebar.vue` | 品牌、导航、用户区 |
| | `SidebarNavItem.vue` | router-link 导航项，active/aria-current |
| | `AppTopbar.vue` | 当前页信息、上传任务入口、窗口控制 |
| | `UserMenu.vue` | 头像、昵称、退出、系统设置 |
| | `WindowControls.vue` | 最小化/最大化/关闭，统一 no-drag |
| `components/common/` | `BrandLogo.vue` | 正式 logo + wordmark |
| | `PageHeader.vue` | 标题、徽标、副标题、右侧动作 |
| | `SectionHeader.vue` | 区块标题 + 数量 + 右侧链接 |
| | `StatCard.vue` | 图标底、指标、说明、进度 |
| | `EmptyState.vue` | 自定义插画 + 标题 + 动作 |
| `components/video/` | `FolderCard.vue` | 文件夹卡：进入、删除菜单、数量 |
| | `VideoCard.vue` | 封面、状态、时长、非课件、meta、菜单 |
| | `FolderCreateDialog.vue` | 替换 `ElMessageBox.prompt` |

### 7.4 后续按需抽取

`QuestionRow.vue`、`QuestionEditorDialog.vue`、`OutlineGenerateDialog.vue`、`GameCard.vue`、`GameSetupDialog.vue`、`WrongBookDrawer.vue`、`HistoryDrawer.vue`、`OutlinePanel.vue`、`OnboardingShell.vue`、`StepIndicator.vue`。

> 原则：至少两个地方复用，或单文件超 800 行且职责清晰时才拆；先原地改版保证功能，再抽取。

### 7.5 保留不动

- 主进程、preload、`api/`、`services/`、SQLite 表结构。
- 路由路径、hash 模式、登录守卫。
- Phaser 场景内部玩法与事件名。
- Polyv 播放器脚本与初始化方式。
- 依赖版本，不升级 Vue/Electron/Element Plus/Vite。

---

## 八、图片素材与资源方案

### 8.1 目录

```text
design/
└─ reference/                     # 仅设计参考，不打包
   ├─ zhuyemian.jpg
   └─ xingjianyemianchankaotu.jpg

src/renderer/src/assets/
├─ brand/
│  ├─ logo-mark.svg               # 正式标志（优先）
│  ├─ logo-mark@2x.png            # 位图后备 256×256
│  ├─ logo-wordmark.svg           # 横向组合
│  └─ app-icon.png                # 512×512
├─ illustrations/
│  ├─ empty-folder.svg
│  ├─ empty-video.svg
│  ├─ empty-quiz.svg
│  ├─ empty-wrongbook.svg
│  ├─ empty-history.svg
│  └─ cover-fallback.svg          # 16:9 视频封面兜底
└─ images/                        # 确有需要才放
   └─ onboarding-bg.webp          # 优先 CSS 渐变

src/renderer/public/
├─ polyv/player.js                # 第三方运行时脚本，保持 public
└─ （不再放设计参考图/logo 原图）

build/                            # 安装器图标
resources/icon.png                # 主进程窗口图标
```

### 8.2 命名与规格

- 全小写 kebab-case；禁止中文、空格、日期后缀；按“用途-形态”命名。
- SVG 优先；位图提供 `@1x/@2x`，单张 ≤200KB。
- Logo 裁掉四周白边，不再使用 `transform: scale(2.2)`。
- 视频封面不使用库存图/参考截图；Polyv 有图用图，无图用 `cover-fallback.svg`。
- 参考截图不得作为产品素材。

### 8.3 Dev / 生产引用

| 场景 | 正确方式 | 禁止 |
|---|---|---|
| 组件内 logo/插画 | `import logo from '@renderer/assets/brand/logo-mark.svg'` | `/images/logo.jpg` 绝对路径 |
| CSS 背景 | `url('@renderer/assets/...')` | `file:///C:/...` |
| 运行时文件 | `new URL('polyv/player.js', document.baseURI).href` | 直接拼 `location.origin` |
| 主进程图标 | `import icon from '../../resources/icon.png?asset'` | 渲染层引用主进程路径 |
| 安装器图标 | `build/icon.*` | 混用 `resources/icon.png` |
| 远程封面 | 直接使用 Polyv URL（CSP 已允许） | 下载到 public 再引用 |

- 生产走 `file://`；electron-vite 默认 `base: './'`，构建后确认 `out/renderer/index.html` 资源前缀为 `./assets/...`。
- 保持 hash 路由，不改 history 模式。
- `polyv/player.js` 构建后应在 `out/renderer/polyv/player.js`。
- 验收重点：logo、空状态插画、播放器脚本在 `file://` 下无 404。

---

## 九、分阶段实施计划

| 阶段 | 范围 | 验收标准 | 预估 |
|---|---|---|---|
| **P0 基线** | 不改 UI，固化现状 | dev 可启动；基线可复现；不产生 Git 写操作 | 0.5 天 |
| **P1 设计底座 + 应用壳** | tokens、EP 主题、字体、滚动条、动效、侧栏/顶栏/窗口控制 | 所有路由可达；导航高亮正确；拖拽/最小化/最大化/关闭正常；退出登录正常；无双重顶栏；1200×700 与 1440×900 无横向滚动；Tab 焦点可见；减少动效生效；未改业务脚本 | 2 天 |
| **P2 视频管理** | 页面头、指标卡、文件夹卡、视频卡、筛选/排序/视图、4 个弹窗、任务面板 | 新建文件夹、上传/暂停/继续/移除、编辑、移动、删除、详情、播放全部可用；字幕/非课件标签正确；面包屑正确；空/加载/错误态完整；3/2/1 列响应正常；弹窗不溢出 | 3 天 |
| **P3 题库 + 关卡** | 题库列表、筛选、分页、CRUD/生成；关卡看板、游戏卡、抽屉、开局 | 题目 CRUD、AI 生成、筛选、分页、展开可用；错题本/历史/清空/错题专项可用；开局参数与跳转 query 正确；抽屉在窄窗口可用 | 2.5 天 |
| **P4 登录/注册/初始化/系统设置** | 登录、注册、Polyv 设置、AI 模型设置、系统设置 | 无 config → 设置 → 模型 → 登录；有 config → 登录；自动登录、退出、注册绑定提示正确；必填校验和接口错误可读；无假社交/忘记密码 | 2.5 天 |
| **P5 播放器 + 小游戏** | 播放页头、舞台、大纲面板、互动浮层、游戏 HUD/结算 | 播放/暂停/seek、错题跳转 `t`、大纲高亮/自动跟随、互动弹出、答对继续、答错/超时回退、关闭开关均正常；游戏普通/无尽/错题模式正常；全屏正常；无定时器/Phaser 泄漏 | 2.5 天 |
| **P6 收口验收** | 响应式、无障碍、空状态、资源、构建 | `npm run build`、`npm run build:unpack` 成功；解包版启动正常；`file://` 资源无 404；所有路由无控制台报错；最小窗口无裁切；安装包体积无明显膨胀 | 2 天 |

### 每阶段 Definition of Done

- 不改 `src/main`、`src/preload`、`api/`、`services/`、数据库结构（P6 打包配置除外）。
- 不新增运行时依赖、不升级依赖。
- 业务动作逐项点击通过，原有错误处理/提示保留。
- 每阶段输出：改动文件清单 + 关键页面截图（存 `design/qa/`，不打包）+ 已知问题。
- 不以“视觉完成”代替“功能完成”，不以静态假数据通过验收。

---

## 十、主要风险

| # | 风险 | 影响 | 等级 | 规避 |
|---|---|---|---|---|
| R1 | VideoManage 1684 行、PlayerView 981 行、QuizBank 1031 行，模板大改可能碰事件/ref | 上传、编辑、移动、播放、答题中断 | 高 | 只改 template/style，script 尽量不动；逐函数对照；先原地改版再抽组件 |
| R2 | 播放器初始化 300ms 与路由动画 250ms 强耦合 | Polyv 在 transform 容器内初始化，全屏/控件错乱 | 高 | 统一 motion token；改动画后重新验证；保留 `#polyv-player` 常驻节点 |
| R3 | 新增 assets、移动 public 图片 | 生产 `file://` 下 logo/插画/播放器脚本 404 | 高 | 使用 import 或 `document.baseURI`；构建后检查 out；解包版实测 |
| R4 | 修改 Element Plus 全局主题 | 按钮、标签、表格、弹窗样式互相影响 | 高 | 只覆盖 token；弹窗专属 class；Teleport 样式放全局；逐组件回归 |
| R5 | 直接引入 `Vq*` | 两套设计系统，样式/行为分裂 | 高 | 不复制 `src/`；只吸收 tokens 与版式 |
| R6 | MainView 重写、/player 与 /game 顶层路由 | 双顶栏、拖拽失效、游戏被裁切 | 中高 | 不改路径；统一 WindowControls；逐路由验证最大化/全屏 |
| R7 | 新增玻璃 HUD、改 z-index/pointer-events | 拖拽弹弓/连线被遮挡；画布比例异常 | 中 | 覆盖层 `pointer-events:none`；画布 1280×720 + FIT；不改场景逻辑 |
| R8 | 参考图 1600 宽，固定弹窗宽度 | 内容裁切、横向滚动 | 中 | 响应式断点、弹窗 `min()`、窄窗降级；最小窗口实测 |
| R9 | 只有 MiSans Normal 一个字重 | 标题 600 为合成，视觉不达设计稿 | 中 | 先验收；不达标再申请补 Medium/Semibold |
| R10 | 卡片 div 点击、自定义导航 | 键盘不可达、读屏不友好 | 中 | 导航用 router-link；卡片加 role/keydown；图标按钮 aria-label；焦点环 |
| R11 | 无自动化测试 + 登录/上传/播放需真实账号 | 无法完整端到端验收 | 高 | 编译/静态检查 + 你本机登录后人工验收；不读取密钥 |
| R12 | 新增资源、Electron 44 + sqlite3 原生模块、asar | 安装包启动失败/资源缺失 | 中高 | `build:unpack` 冒烟；不新增原生依赖；检查 asarUnpack/图标/播放器脚本 |
| R13 | 参考图只有视频管理页 | 其他页面风格不统一 | 中 | 先定 tokens + 组件，再逐页复用；每页评审 |
| R14 | 改滚动条、body 背景、user-select、EP 变量 | 播放器/游戏/弹窗滚动或选区异常 | 低中 | 用作用域变量；播放器/游戏单独验收；输入框保留选区 |

---

## 十一、改造边界（明确不做）

- 不全局替换 Element Plus，不重写为自研组件库。
- 不复制 `VideoQuest-Vue-Components/src`，不引入第二套 `Vq*`。
- 不新增 Pinia/TypeScript/Tailwind/其他 UI 库。
- 不升级 Vue/Electron/Vite/Element Plus/Phaser。
- 不修改路由路径、hash 模式、登录守卫。
- 不修改主进程 API、Polyv 签名、SQLite 表结构、Phaser 玩法。
- 不删除任何业务功能；删除入口只是从独立图标收进“更多”菜单。
- 不新增“工作台/学习分析/AI 助手/通知/微信登录/忘记密码”。
- 不使用参考截图作为产品图片素材。
- 不把假数据、空函数、占位接口带上线。
- 确认前不执行任何 Git 写操作。

---

## 十二、待确认事项

1. **Element Plus 保留**：按方案只做主题 + 布局组件，不替换。是否同意？
2. **顶栏内容**：只放真实动作（上传任务、用户菜单、窗口控制），不做假 AI 助手/通知；页面级搜索放在视频管理和题库内部。是否同意？
3. **指标卡数据**：截图中的“存储容量/处理管道”无真实数据源，替换为“当前目录视频/总时长、智能字幕、上传任务、题库/错题”等真实指标；宁可不显示也不造假。是否接受？
4. **窗口尺寸**：保持主界面 1200×700（改版按此适配），还是提升默认到 1360×840 并把最小尺寸改为 1024×640？后者需要改主进程窗口配置。
5. **资源清理**：把 `zhuyemian.jpg` / `xingjianyemianchankaotu.jpg` 移到 `design/reference/`（不进安装包），并把 logo 换成裁切好的 SVG/PNG。是否同意？
6. **验收方式**：登录后页面、上传、播放、Polyv 接口需要真实账号环境。你可以保持本机登录由我操作验证，或按清单手动验收。请确认哪种方式。

---

> 确认后建议从 **P0 基线 + P1 应用壳** 开始，先交付可运行、可对比的壳层版本，再进入视频管理页；不会先动业务脚本。
