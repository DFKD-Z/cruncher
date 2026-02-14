# cruncher

**图片 / 视频压缩** · 本地智能媒体处理桌面应用

基于 Tauri 2 + React 19 构建，支持图片裁剪、无损/视觉无损压缩，数据完全本地处理，不上传云端。

![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## ✨ 特性

- **本地处理**：所有数据在设备内完成，不离开您的电脑
- **图片压缩**：支持 PNG、JPG、JPEG、WEBP、GIF、BMP、TIFF 等格式，使用 Rust `image` + `oxipng` + `webp` 库
- **视频压缩**：基于 FFmpeg（需系统安装），支持 MP4、MOV 等
- **无损 / 视觉无损**：可切换压缩模式，平衡体积与画质
- **图片裁剪**：选区裁剪、预设比例（1:1 等）、画质与分辨率调节
- **批量任务**：JobManager 调度，支持取消、进度追踪、多阶段流水线
- **多语言**：中文 / English
- **跨平台**：macOS、Windows、Linux

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 2 (Rust) |
| 前端 | React 19 + Vite 7 + TypeScript |
| 路由 | React Router 7 |
| 样式 | Tailwind CSS 4 |
| 图标 | Lucide React |
| 图片裁剪 | react-image-crop |
| 图片处理 | image, oxipng, webp (Rust) |
| 视频处理 | FFmpeg（需系统安装） |
| Tauri 插件 | dialog, fs, opener, shell |

---

## 📦 环境要求

- **Node.js**：18+
- **pnpm**：推荐（也支持 npm / yarn）
- **Rust**：用于 Tauri 后端（安装 [Rustup](https://rustup.rs/)）
- **FFmpeg**（可选）：视频压缩需要，[安装指南](https://ffmpeg.org/download.html)

---

## 🚀 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm tauri dev
# 或
pnpm tauri:dev
```

### 构建生产版本

```bash
pnpm tauri build
```

### 仅前端开发（不启动 Tauri）

```bash
pnpm dev       # 启动 Vite 开发服务器
pnpm build     # 构建前端资源
pnpm preview   # 预览构建结果
```

---

## 📁 项目结构

```
cruncher/
├── src/                         # React 前端
│   ├── components/              # UI 组件
│   │   ├── AssetGrid.tsx        # 资产网格
│   │   ├── CropPage.tsx         # 裁剪页
│   │   ├── FileDropZone.tsx     # 拖拽导入
│   │   ├── FfmpegBanner.tsx     # FFmpeg 检测提示
│   │   ├── ImportWorkspace.tsx  # 导入工作区
│   │   ├── ModeSelector.tsx     # 压缩模式选择
│   │   ├── OutputPicker.tsx     # 输出目录选择
│   │   ├── PreviewModal.tsx     # 预览弹窗
│   │   └── ...
│   ├── pages/
│   │   └── ImageDetailPage/     # 图片详情与裁剪
│   │       ├── index.tsx
│   │       ├── CropSettingsPanel.tsx
│   │       ├── CompressSettingsPanel.tsx
│   │       ├── DetailSidebar.tsx
│   │       ├── ImagePreviewArea.tsx
│   │       └── ...
│   ├── hooks/
│   │   ├── useCompress.ts       # 压缩逻辑
│   │   ├── useFfmpegCheck.ts    # FFmpeg 检测
│   │   ├── useI18n.ts           # 国际化
│   │   ├── useImageProcess.ts   # 图片处理
│   │   └── useTheme.ts          # 主题
│   ├── locales/                 # i18n 语言包
│   ├── types/
│   └── utils/
├── src-tauri/                   # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── core/
│   │   │   ├── image.rs         # 图片压缩、裁剪、元数据
│   │   │   └── video.rs         # 视频压缩、FFmpeg 检测
│   │   ├── job/
│   │   │   ├── manager.rs       # 任务调度与状态
│   │   │   └── types.rs         # Job 类型定义
│   │   ├── pipeline/
│   │   │   ├── executor.rs      # 流水线执行
│   │   │   ├── stage.rs         # 阶段定义（Crop/Resize/Convert/Compress/Save）
│   │   │   └── validator.rs     # 流水线校验
│   │   ├── progress/            # 进度事件
│   │   ├── lib.rs               # 命令入口
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── README.md
```

---

## 🔄 流水线阶段

图片处理采用多阶段流水线（`PipelineStageKind`）：

| 阶段 | 说明 | 权重 |
|------|------|------|
| Crop | 裁剪 | 15% |
| Resize | 缩放 | 20% |
| Convert | 格式转换 | 15% |
| Compress | 压缩 | 35% |
| Save | 保存 | 15% |

任务通过 `create_image_job` 创建，支持 `image-job-progress` 事件实时推送进度，可随时 `cancel_image_job` 取消。

---

## 🎯 使用说明

1. **导入资产**：拖拽或点击「浏览」添加图片 / 视频，或「导入文件夹」批量添加
2. **选择模式**：无损（体积较大）或 视觉无损（体积更小）
3. **可选裁剪**：进入图片详情页，进行选区裁剪或使用预设比例
4. **开始压缩**：选中任务后点击「开始压缩选中」，或使用批量处理
5. **导出**：选择输出目录或直接下载到默认位置

> 若未检测到 FFmpeg，应用会显示提示条，视频压缩功能将不可用。

---

## 📄 License

MIT
