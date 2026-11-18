# 日语术语速查

日语译员的专业术语速查与分类管理工具。输入中文 / 日文 / 读音 / 备注即时命中，点击日文一键复制，数据保存在浏览器本地（localStorage），支持 CSV（Excel 可直接打开）与 JSON 导入导出。

## 功能

- 即时搜索：中文、日文、假名读音、备注全字段匹配；快捷键 `/` 或 `Ctrl/⌘+K` 聚焦搜索框
- 分类管理：左侧分类栏（移动端为横向标签），支持新增、重命名、删除
- 术语字段：中文 / 日文 / 读音 / 分类 / 备注
- 导入导出：CSV 列序为 `中文,日文,读音,分类,备注`（带 BOM，Excel 不乱码）；JSON 为完整备份；导入自动识别表头、去重
- 数据全部存于浏览器本地，不上传任何服务器；可安装为 PWA 离线使用

## 本地运行

```bash
npm install
npm run dev      # 开发预览 http://localhost:3000
npm run build    # 构建到 dist/
```

## 部署到 GitHub Pages

仓库已内置 GitHub Actions 工作流（`.github/workflows/deploy.yml`）：

1. 在 GitHub 新建仓库，把本目录全部文件 push 到 `main` 分支
2. 仓库 Settings → Pages → Source 选择 **GitHub Actions**
3. push 后工作流自动构建并发布，地址为 `https://<用户名>.github.io/<仓库名>/`

## 技术栈

React + TypeScript + Vite + Tailwind CSS + shadcn/ui，图标 lucide-react，无后端。
