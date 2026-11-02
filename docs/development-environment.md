# 临时开发环境（Windows x64）

BranchHarbor 在 Windows 上使用项目内、可删除的开发工具链。脚本不修改用户或系统 PATH，不写 PowerShell Profile，不全局安装 npm 包，也不安装 VS、SDK、WebView2、Docker 或 WSL。

## 复用的系统组件

- 已安装的 Git。
- Visual Studio 2022 的 C++ 桌面工具链（MSVC x64/x86）与 Windows SDK。
- Microsoft Edge WebView2 Runtime。

2026-11-02 本机检查：VS 2022 17.14、MSVC 14.44.35207、Windows SDK 10.0.26100.0、WebView2 150.0.4078.83 已存在。发现的 Node 来自 Codex 内部目录，因此项目使用独立 ZIP 版本，避免依赖 Codex 的安装结构。没有在当前 PATH 找到 Rust。

## 安装与使用

在仓库根目录运行（PowerShell 5.1 或 7）：

```powershell
./scripts/windows/setup.ps1
./scripts/windows/dev.ps1
```

setup 下载固定版本的官方 Node ZIP、rustup 和 Rust 工具链，将 pnpm 安装在项目专用目录。Node ZIP 与 rustup 安装器校验仓库内固定的 SHA-256；Rust 组件由 rustup 验证，pnpm 由 npm 的完整性机制验证。版本及哈希在 `scripts/windows/tool-versions.json`，更新时一起审阅。当前受限环境不允许创建 rustup 的代理链接，因此将同一官方二进制复制为 rustup、cargo、rustc 等入口，再调用 rustup 下载工具链；不运行系统安装流程。副本会额外占用一些项目磁盘空间。

dev 打开继承项目环境的子终端；在里面运行 `node`、`pnpm`、`cargo` 等。输入 `exit` 关闭子终端后，父终端保持原来的环境。也可以只运行一条命令：

```powershell
./scripts/windows/dev.ps1 node --version
./scripts/windows/dev.ps1 pnpm --version
./scripts/windows/dev.ps1 cargo --version
```

如果 PowerShell 的执行策略阻止本地脚本，可以仅为本次进程设置：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/windows/setup.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/windows/dev.ps1
```

企业策略仍可能禁止脚本；不通过修改永久执行策略绕过。脚本只配置环境，此时尚未生成 Vue/Tauri 应用。

## 数据位置

```text
.dev-env/                 # 全部忽略，不进入 Git
  node-v*-win-x64/        # 便携 Node 与 npm
  tools/                 # 项目专用 pnpm
  cargo/                 # Cargo、注册表、下载与 Git 依赖缓存
  rustup/                # Rust、rustfmt、Clippy 工具链
  target/                # Rust 构建产物
  pnpm-store/            # pnpm 依赖存储
  npm-cache/             # npm 下载缓存
  config/                # 项目专用用户配置位置
  cache/ data/           # XDG 工具缓存与数据
  local-app-data/         # 子进程使用的本地应用数据位置
  app-data/              # 子进程使用的漫游应用数据位置
  tmp/ downloads/        # 临时文件与安装包
```

`CARGO_HOME`、`RUSTUP_HOME`、npm/pnpm 缓存、XDG、APPDATA/LOCALAPPDATA、TEMP/TMP 和 PATH 仅在执行脚本及其子进程中生效；工具不会使用用户目录下默认的 Cargo/Rustup 位置。不要在这个隔离终端里配置 Git 凭据、进行平台登录或启动其他日常应用：改变 APPDATA 会改变部分程序寻找配置的方式。未来账户数据和凭据的存储策略单独设计。

该目录用于本机工具链，不等于沙箱或虚拟机。Windows、VS、杀毒软件、崩溃报告以及未来依赖的安装脚本仍可能在系统位置留下日志；不承诺零系统痕迹。

项目依赖 `node_modules/` 和前端构建产物 `dist/` 位于仓库内；都可重新生成，不进入 Git。引入 Tauri 后 Windows 本地优先使用 NSIS 打包，MSI 可选组件与其他平台发行构建交给 CI 配置。macOS、Linux 的本机系统依赖仍需在对应平台准备。

## 清理

先关闭隔离终端及其运行的开发服务、编译进程，再从普通终端执行：

```powershell
./scripts/windows/clean.ps1 -WhatIf
./scripts/windows/clean.ps1
```

第二条命令显示确认提示。清理脚本只删除当前仓库下、带有所有权标识且不是链接的 `.dev-env`；保留源码、Git 历史、原有 Git、VS、SDK 和 WebView2。未来创建的 `node_modules/`、`dist/` 可单独删除，需要再次开发时重新安装即可。应用真实用户数据、系统凭据和签名密钥不能作为构建缓存一起删除。

## 依据

- [Tauri 开发前置依赖](https://v2.tauri.app/start/prerequisites/)
- [Rustup 自定义安装位置](https://rust-lang.github.io/rustup/installation/index.html#choosing-where-to-install)
- [Rustup 环境变量](https://rust-lang.github.io/rustup/environment-variables.html)

固定工具版本由官方 Node 发布目录、Rust stable manifest 与 npm registry 核对；Node 24 为本项目选用的 LTS 系列。
