# cruncher

**图片 / 视频压缩** · 本地智能媒体处理桌面应用

基于 Tauri 2 + React 19 构建，支持图片裁剪、无损/视觉无损压缩，数据完全本地处理，不上传云端。

![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## ✨ 特性

- **本地处理**：所有数据在设备内完成，不离开您的电脑
- **图片压缩**：支持 JPG、PNG、WEBP 等格式，使用 Rust `image` + `oxipng` + `webp` 库
- **视频压缩**：基于 FFmpeg，支持 MP4、MOV 等
- **无损 / 视觉无损**：可切换压缩模式，平衡体积与画质
- **图片裁剪**：选区裁剪、预设比例（1:1 等）、画质与分辨率调节
- **多语言**：中文 / English
- **跨平台**：macOS、Windows、Linux

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 2 (Rust) |
| 前端 | React 19 + Vite 7 + TypeScript |
| 样式 | Tailwind CSS 4 |
| 图标 | Lucide React |
| 图片裁剪 | react-image-crop |
| 图片处理 | image, oxipng, webp (Rust) |
| 视频处理 | FFmpeg（需系统安装） |

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
├── src/                    # React 前端
│   ├── components/         # UI 组件
│   │   ├── AssetGrid.tsx
│   │   ├── CropPage.tsx
│   │   ├── FileDropZone.tsx
│   │   ├── ImageDetailPage/ # 图片详情与裁剪
│   │   └── ...
│   ├── hooks/              # 自定义 Hooks
│   │   ├── useCompress.ts
│   │   ├── useFfmpegCheck.ts
│   │   └── useI18n.ts
│   ├── pages/
│   ├── locales/            # i18n 语言包
│   └── types/
├── src-tauri/              # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── core/
│   │   │   ├── image.rs    # 图片压缩、裁剪
│   │   │   └── video.rs    # 视频压缩、FFmpeg 检测
│   │   ├── lib.rs
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── README.md
```

---

## 🎯 使用说明

1. **导入资产**：拖拽或点击「浏览」添加图片 / 视频
2. **选择模式**：无损（体积较大）或 视觉无损（体积更小）
3. **可选裁剪**：对图片进行选区裁剪或使用预设比例
4. **开始压缩**：选中任务后点击「开始压缩选中」
5. **导出**：选择输出目录或直接下载到默认位置

> 若未检测到 FFmpeg，应用会提示，视频压缩功能将不可用。

---

## 📄 License

MIT
