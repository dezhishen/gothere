# 一定要到达那里

一个轻松诙谐、以关卡数据驱动的 2D 环境解谜原型。主角是一个认准目的地就往前走的倔家伙；点击场景中的编号机关，或下方同名按钮，帮助他越过麻烦、到达目的地。

最终目标：制作在 Steam 发行的原创解谜游戏与关卡创作工具。目前已完成六关可玩原型、JSON 规则、可注册的文档解释器与能力实现、多层地图、巡逻与碾压类机关、确定性回放和手机浏览器试玩。

![游戏原型：旅行者、伸缩木桥和目的地旗帜](docs/images/gameplay.png)

下一里程碑为 **v0.3：关卡编辑器与十关验证**。先完成拖放、属性、事件配置、保存和立即试玩的创作闭环，用编辑器制作累计十张关卡，同时验证 Windows 独立包的发行路径。详细范围与验收标准见 [project.md](project.md)。

## 启动

需要 Node.js 26 与 pnpm 12。

```sh
pnpm install
pnpm dev
```

浏览器打开 http://localhost:4173。`pnpm dev` 会同时监听 Tailwind 样式并启动静态服务器；只跑 `pnpm start` 也可以，但样式要先由 `pnpm css` 生成。

服务器会显示局域网地址。局域网访问受网络隔离、防火墙和客户端影响；手机优先使用下面的公网试玩方式。

## 给 AI Agent 的创作侧 CLI

平台把「解析器（interpreter）」和「运行」分开：每个解释器声明自己支持的 schema、
类型与能力版本，平台按文档的版本要求选一个解释器来解析并运行；内容只贡献 JSON。

```sh
pnpm cli skills --json                  # 能力清单 + 解释器支持矩阵
pnpm cli platform                       # 解释器与平台整体支持集
pnpm cli schema bridge                  # 某类型的字段、状态、事件、能力
pnpm cli level list
pnpm cli level validate demo.level.json --mode playable --json
pnpm cli level simulate first-bridge --inputs '[{"tick":1,"source":"lever"}]' --json
pnpm cli level diff first-bridge quiet-corner --json
```

约定：`--json` 时 stdout 只有协议对象（日志走 stderr）；错误只靠稳定错误码；退出码
0 成功 / 2 用法错误 / 3 校验失败 / 4 模拟失败 / 5 内部错误。清单只列已实现的只读
能力，写操作（如 `level.apply`）在实现之前不会出现。浏览器里可以用
`window.gothere.platform()` 拿到同一份支持矩阵。

## 手机与异地试玩

```sh
pnpm share
```

命令会构建单文件版本，并用系统自带的 SSH 通过 [localhost.run](https://localhost.run/docs/) 提供临时 HTTPS 地址，不需要账号。手机在浏览器里打开输出的地址即可，不需要与电脑连接同一 Wi-Fi。试玩期间需要保持电脑、网络和这个命令运行；重新运行可能得到不同地址。

分享服务器只提供游戏页面和 `/play.html` 下载，不开放源码目录、测试产物或内部项目文档。地址记录在 artifacts/share.json；单文件内置的是公开试玩说明。

这个方法适合把本地改动临时发给别人看。想要一个长期可用的公开地址，用下面的 GitHub Pages 发布即可。

## 保存或分发单文件版本

```sh
pnpm build
```

构建会先用 Tailwind 编译 `src/styles/app.css`，再把样式、脚本和地图打成单文件。

生成 dist/gothere-play.html 和 dist/index.html，包含所有画面、样式、逻辑和六张地图。现代桌面浏览器可以直接打开 HTML 离线试玩，也可以将 dist/index.html 放到静态网站托管服务。手机优先使用 HTTPS 链接；不同系统的文件预览器对本地 HTML 执行的支持不同。

## 发布到 GitHub Pages

推送到 `main` 会自动运行 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)：安装依赖 → `pnpm test` → `pnpm build` → 把 `dist/` 作为 Pages 产物发布。也可以在 Actions 页面手动触发 `Deploy to GitHub Pages`。

首次使用需要在仓库 **Settings → Pages** 把 **Source** 设为 **GitHub Actions**。没开启之前工作流会在 `Configure Pages` 步骤报 `Get Pages site failed`；开启后到 Actions 页面重跑一次 `Deploy to GitHub Pages` 即可发布。

发布地址：https://dezhishen.github.io/gothere/ 。发布的是单文件版本（样式、脚本、关卡全部内联），所以放在 `/<repo>/` 子路径下也不需要改配置；`project.md`、源码和测试产物都不会发布。

## 样式

样式入口是 `src/styles/app.css`，由 Tailwind CSS v4 编译成 `src/style.css`（生成物，不入库）。

- 颜色、字体等设计令牌定义在 `@theme`，可直接使用 `bg-paper`、`text-ink`、`font-serif` 等工具类。
- 现有组件保留语义类名（`.game-shell`、`.hotspot` 等），内部用 `@apply` 组合工具类；新增界面可以直接在 HTML 里写工具类。
- 不启用 Tailwind 的 preflight，基础重置留在 `@layer base`，以保持既有像素级设计不变。
- `pnpm css` 单次编译，`pnpm css:watch` 持续监听，`pnpm dev` 会自动同时启动样式监听和开发服务器。

## 操作

- 点击「出发！」，然后轻点编号机关。机关按钮也可用键盘聚焦后操作。
- 「暂停一下」停止时间；暂停时可单步前进。点击 1× 可切换 2×、4×。
- 空格：开始/暂停；R：重置；1～6：切换关卡。焦点在按钮、输入框或对话框时保留原生键盘行为。
- 「回放本次」从头播放当前关卡已执行的操作。回放期间机关交互锁定。
- 「需要一点提示？」显示本关的时序提示。
- 「关卡数据」支持 JSON 编辑、文件导入、校验、加载、导出。加载无效数据不会替换当前关卡。

## 六张关卡

1. 桥呢？桥呢！：开关改变木桥状态，验证点击和因果。
2. 借过一下：风扇仅停 4 秒；踩下压力板后自动开门。
3. 赶个巧：木桥保持 5 秒，风扇保持 4 秒，需要分时操作。
4. 斧头与锤子：走过斧头会自动拿起（拿着就不扎脚），点一下放进身后的地面；
   再拿起锤子点一下，木栅门才开。
5. 上下两趟：地图是多层的——走进电梯轿厢再点开关，电梯把人送到二楼，
   然后沿楼梯走回地面。
6. 全都来一遍：把上面的机制摆在同一张图上。先点斧头放下（等一下要拿回来），
   再让巡逻守卫停下，拿起钥匙才踩得开压力板；木桥只延伸 5 秒、电梯要等
   人进轿厢再按，最后爬楼梯到二楼终点。

关卡是 `levels/*.level.json` 内容制品，不参与编译；每张地图都可以不依赖画面运行，
没有单独的关卡专用代码。

## 目录

- `project.md`：项目愿景、架构与后续路线。
- `docs/design.md` / `docs/architecture.md`：平台与内容的边界、模块分层与里程碑。
- `src/core/contract/`：类型与字段注册表、版本与支持矩阵、四层校验、编译、diff、PRNG、迁移。
- `src/core/capabilities/`：能力实现单元（单击、延长地面、阻挡、区域、可持有、接触伤害、
  垂直乘坐、巡逻自走），每个能力自带 traits 与相位 hook，内核只按名字调度。
- `src/core/kernel/`：固定 60 tick 推进、相位顺序、预算、快照与回放。
- `src/core/interpreters/`：两层注册表。数据制品解释器固定 4 种（`level` / `bundle` /
  `manifest` / `recording`）；内容抽象工厂固定 3 种（`factories/` 下的 `map` / `mechanism` /
  `item`），每类工厂按同一份接口产出自己的类型，注册只能落到已有类型上。
- `src/app/`：用例层、内容源端口、错误码与 Agent skill 清单。
- `levels/*.level.json` + `levels/manifest.json`：关卡内容制品。
- `bin/gothere.mjs`：创作侧 CLI（`pnpm cli`）。
- `src/styles/app.css`：Tailwind CSS v4 入口。设计令牌放在 `@theme`，组件类用 `@apply` 组合工具类；构建输出到 `src/style.css`（生成物，不入库）。
- `src/scene.js`：Canvas 场景与原创程序绘制角色；未知类型走占位回退。
- `src/main.js`：界面、输入、固定步长驱动和关卡数据面板。
- `tests/`：契约、能力、解释器、用例、CLI、内容与 HTTP 测试。
- `scripts/build.mjs`：无第三方运行时依赖的单文件打包，构建期校验并内联关卡。
- `scripts/check-layers.mjs`：分层门禁（依赖只向下、能力实现必须是叶子模块）。
- `scripts/css.mjs`：调用 Tailwind CLI 编译样式；`scripts/dev.mjs` 同时跑样式监听与开发服务器。
- `scripts/browser.mjs`：端到端脚本共用的 Chromium 选择逻辑。
- `scripts/share.mjs`：只转发单文件游戏的临时 HTTPS 试玩。

## DSL 语义

当前空间为 1200×640，地面高度 440；角色只向右自动行走，speed 单位为世界单位/秒。地面由水平区间组成，桥延伸时补足地面。渲染器可以完全替换。

实体类型（预设）：机关族 switch（off/on）、bridge（folded/extended）、hazard（running/stopped）、gate（closed/open）、plate（idle/pressed）、lift（lower/upper）、guard（patrolling/stopped）、crusher（active/parked）；物品族 axe、hammer 与 key（idle/held）。类型只是「能力组合 + 外观」的数据，行为住在 `src/core/capabilities/`；所以同一预设可以用 `capabilities: { "holdable": false }` 换个配置，不需要新类型。新增类型只能注册到已有的三个内容工厂（`map` / `mechanism` / `item`）里，实现该工厂的类型接口。

规则含 `on: { type: "click" | "enter", source: "entity-id" }`，可选 `if: [{entity, state}]`，和 `actions`。click 只接受开关或危险物；enter 只接受压力板。动作支持 `{type:"set",target,state}` 和 `{type:"after",ticks,actions}`。未知能力、非法引用、重复 ID 和错误状态会在加载前拒绝。

每个 tick：推进时钟 → 到期动作按 due/order 执行 → 点击按记录顺序执行 → onMotion（巡逻等自走实体移动）→ 角色前进 → onContact（压力板等区域首次接触）→ onBlock（门、危险物、碾压）→ 检查终点与超时。规则按声明顺序执行，后续规则可以观察前面规则的状态变化。延迟相对动作实际执行的 tick 计算；after 不支持取消，同一目标的到期写入按上述顺序依次生效。条件在规则触发时检查，延迟动作不重新判断条件。

输入只在 running 状态接收，并在下一个 tick 处理。暂停不处理输入；单步可从 ready/paused 执行一个 tick。每局上限 36,000 tick；暂停、切关、重置和倍速均不改变模拟规则。这里的确定性面向同一份关卡数据和兼容的 JS 运行时，不是跨版本物理引擎的承诺。

运行时最多执行 1,024 个动作/tick，并最多保留 256 个待执行计时器。超过预算会结束当前局并显示原因，重置后可以继续测试，避免重复触发的导入规则堆积任务。

## 验证

```sh
pnpm test
pnpm test:coverage
```

核心测试使用 Node 内置 test，样式由 Tailwind 预构建（`pretest` 自动执行）。覆盖率阈值针对可复用的 `src/core/`，画面和交互通过浏览器流程测试验证。

浏览器测试脚本使用 Playwright（版本由 `package.json` 锁定）。首次运行需要下载 Chromium，Windows 已安装标准位置的 Edge 时脚本会直接使用它：

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

测试截图保存在 artifacts/。

分享命令运行期间，可用 `pnpm test:share` 检查真实公网 HTTPS 链接，并通过手机视口的触控操作实际通关。`pnpm test:e2e` 也覆盖断网后从本地 HTML 直接试玩，以及公开预览服务器的内容安全策略。

原型不包含拖放编辑器和随机地图生成；后续阶段见 project.md。
