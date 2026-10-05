# herdr-pet

[English](README.en.md) · 简体中文

Herdr 的独立桌面宠物插件，支持 macOS 和 Windows。显示 agent 状态、最近终端输出，并发送文字或本机语音生成的草稿。安装不修改 Herdr 源码。

## 安装与启动

需要 Herdr 0.9.0+、Node.js 20+、Rust 工具链及 [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)。语音构建还需要 CMake、C++ 编译器和 libclang：macOS 使用 Xcode Command Line Tools，Windows 使用 Visual Studio 的“使用 C++ 的桌面开发”、Windows SDK 和 LLVM。Windows 请使用原生 PowerShell 和 MSVC Rust 工具链。

先在另一个终端启动 Herdr，再在本仓库运行：

```sh
npm ci
npm run build
herdr plugin link .
herdr plugin action invoke herdr.pet.start
```

macOS 生成带麦克风用途说明的 `.app`，插件启动其可执行文件；Windows 生成 `herdr-pet.exe`。`plugin link` 不会构建，更新源码后先停止宠物，再重新构建、启动：

```sh
herdr plugin action invoke herdr.pet.stop
npm run build
herdr plugin action invoke herdr.pet.start
```

```sh
herdr plugin action invoke herdr.pet.show
herdr plugin action invoke herdr.pet.stop
herdr plugin unlink herdr.pet
```

`start` / `show` 复用同一个插件进程，默认不会随 Herdr 自动启动。启动日志在 Herdr 提供的插件状态目录中的 `pet.log`。发布到 GitHub 后可用 `herdr plugin install <owner>/<repo>` 安装，安装会执行清单中的构建命令。卸载前先停止，再执行 `herdr plugin uninstall herdr.pet`。

开发模式 `npm start` 默认连接 debug 的 `herdr-dev`。连接官方版需设置实际 socket 路径。路径受 `XDG_CONFIG_HOME` 等配置影响，下面是默认目录、默认会话的示例：

```sh
HERDR_SOCKET_PATH="$HOME/.config/herdr/herdr.sock" npm start
```

```powershell
$env:HERDR_SOCKET_PATH = Join-Path $env:APPDATA "herdr\herdr.sock"
npm start
Remove-Item Env:HERDR_SOCKET_PATH
```

`HERDR_SESSION` 可选择命名会话，显式 `HERDR_SOCKET_PATH` 优先。插件启动继承 Herdr 提供的会话路径。

## 交互与主题

- 拖拽移动宠物，双击聚焦当前 agent；位置会保存。
- 悬停展开卡片，显示标题、状态和持续时间。点击卡片聚焦 pane，消息图标打开输入页。
- 最近输出显示所选 agent 末尾两条非空终端内容，每条最多 180 个字符。悬停卡片或键盘聚焦选择预览，默认选择当前展示的 agent。只在气泡可见时读取一个 agent，每 5 秒刷新；读取失败保留卡片和状态。
- 右上角菜单集中提供 Theme（主题）、语言、皮肤、会话和退出，没有重复的右键菜单。只有多个会话时显示会话选项。
- 六款主题与 Herdr 内置颜色一致：Catppuccin Mocha / Latte、Tokyo Night / Day、Gruvbox Dark / Light，应用于气泡、文字、按钮、状态和宠物。手选主题持久保存且优先于自动匹配；只有选回自动才查询 Herdr 主题接口。接口不可用时使用 Catppuccin Mocha。

输入页左上角返回，麦克风和发送按钮位于输入框内。Enter 换行，Ctrl/Cmd + Enter 发送，输入法组合输入不触发快捷发送。草稿按会话和 agent 保留至退出。提交失败保留正文，成功提示“已提交给 Herdr”，不代表 agent 已完成任务。

## 本机语音输入

首次点击麦克风请求权限、下载并加载多语言 Whisper Base。模型约 142 MiB，来自 [whisper.cpp 模型仓库](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md)，使用 [whisper-rs](https://docs.rs/whisper-rs/0.16.0/whisper_rs/) 在 Rust 中推理。

准备完成后开始录音，再次点击麦克风停止，最长 60 秒自动停止。转写插入原光标位置或替换选中文字，请检查后手动发送。中文界面按中文识别，英文界面按英文识别。权限、下载、加载、录音或转写期间均可取消；取消与失败保留已有草稿。

音频仅在内存中处理，不上传、不写音频文件。首次下载模型需要网络，之后可离线转写。模型缓存在应用本机数据目录 `models/ggml-base.bin`。下载失败再次点击重试；损坏模型需删除后重下：

- macOS：`~/Library/Application Support/dev.herdr.pet/models/ggml-base.bin`
- Windows：`%LOCALAPPDATA%\dev.herdr.pet\models\ggml-base.bin`

macOS 权限在“系统设置 → 隐私与安全性 → 麦克风”管理；Windows 请允许“设置 → 隐私和安全性 → 麦克风 → 允许桌面应用访问麦克风”。

## Herdr 兼容性与窗口

| 功能 | 官方 Herdr | 提供扩展接口的 Herdr fork |
| --- | --- | --- |
| agent 状态、预览、发送、pane 聚焦 | 使用已有接口 | 同样支持 |
| 六款手选主题 | 支持 | 支持 |
| 自动匹配实际主题 | 默认 Catppuccin | `client.theme.get` 可用时启用 |
| 吊起终端窗口 | 提示已聚焦，无法自动吊起 | `client.activate` 与当前终端支持时启用 |

扩展接口是可选功能，版本号本身不保证提供。缺少激活接口不影响消息或 pane 聚焦。已有接口但激活失败时，提示聚焦已成功及激活失败原因。配套 fork 当前支持 macOS 直接运行 Herdr 的 Ghostty；其他终端、tmux、GNU Screen 和 Windows 的窗口激活取决于 Herdr 端支持。

透明无边框窗口保持置顶，拖拽及显示器变化后调整回可见区域。macOS 支持所有工作区及普通全屏窗口，输入时降低窗口级别以配合原生输入法候选窗；Windows 使用原生置顶和窗口拖拽。系统锁屏与安全桌面不属于覆盖范围。

## 皮肤与动画

默认“小精灵”，右上角菜单 → 皮肤可切换“小云朵”和“机械猫”。选择独立保存，重启或切换会话后保留，三款共用圆角气泡和输入界面。

本体颜色固定。主题只改变小精灵尖顶和手臂、机械猫耳灯和胸灯、小云朵天气配件；状态使用当前主题的强调、工作、提醒、完成、未知或弱化色。小云朵用太阳、雨滴、乌云闪电和薄雾表达状态。

空闲呼吸和眨眼；工作时小幅循环；待处理进入时轻跳一次；完成庆祝一次；未知缓慢侧倾；离线闭眼静止。连续状态刷新不会重复播放入场动画。悬停时视线跟随，拖拽时暂停，松开后轻微回弹。系统开启“减少动态效果”时保留静态状态，停止动画；窗口隐藏时暂停动画。
