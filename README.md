# Doc Scraper 📚

**通用文檔爬蟲工具** - 將任何技術文檔網站轉換為 Markdown/CSV/Anki 格式，建構你的「認知外掛」學習系統。

---

## 功能特色

- 🎯 **預設配置** - 內建多種常見文檔框架的預設配置
- 🔧 **高度客製化** - 支援自定義選擇器和參數
- 📄 **多格式輸出** - Markdown、CSV、Anki 卡片、Q&A 問答對
- 🧠 **NotebookLM 整合** - 優化輸出格式，便於 RAG 學習
- 🃏 **Anki 間隔重複** - 自動生成閃卡，強化記憶
- 🚀 **簡單易用** - 一行指令即可開始爬取
- 🔄 **可重複使用** - 學習新技術時直接套用

---

## 快速開始

### 安裝

```bash
cd ~/Desktop/doc-scraper

# 安裝依賴
npm install

# 安裝瀏覽器引擎（首次使用需要）
npx playwright install chromium

# 全域安裝（可選，讓指令更方便）
npm link
```

### 基本使用

```bash
# 查看所有預設配置
node scraper.js list

# 爬取 Claude Code 中文教程
node scraper.js scrape claude-code-cn

# 爬取任意網站（快速模式）
node scraper.js quick https://docs.example.com
```

---

## 指令說明

### `list` - 列出預設配置

```bash
node scraper.js list
```

輸出：
```
📚 可用的預設配置:

  claude-code-cn      Claude Code 中文教程
  vitepress           VitePress 文檔 (通用)
  docusaurus          Docusaurus 文檔 (通用)
  gitbook             GitBook 文檔 (通用)
  readthedocs         Read the Docs (通用)
  nextra              Nextra 文檔 (通用)
  custom              自定義配置
```

### `scrape <preset>` - 使用預設配置爬取

```bash
# 基本用法
node scraper.js scrape <preset-name>

# 完整參數
node scraper.js scrape <preset-name> [options]
```

**參數說明：**

| 參數 | 說明 | 預設值 |
|------|------|--------|
| `-u, --url <url>` | 覆蓋預設 URL | 預設配置中的 URL |
| `-o, --output <dir>` | 輸出目錄 | `./output` |
| `-c, --combined <file>` | 合併檔案名稱 | `combined.md` |
| `-f, --format <format>` | 輸出格式: `md`, `csv`, `anki`, `all` | `md` |
| `--qa` | 生成 Q&A 問答對 | 關閉 |
| `--summary` | 生成章節摘要 | 關閉 |
| `--content-selector <s>` | 覆蓋內容選擇器 | 預設配置中的選擇器 |
| `--link-selector <s>` | 覆蓋連結選擇器 | 預設配置中的選擇器 |
| `--wait <ms>` | 頁面等待時間 | 1500 |
| `--timeout <ms>` | 頁面超時時間 | 30000 |
| `--max-pages <n>` | 最大爬取頁數 | 無限制 |
| `--no-headless` | 顯示瀏覽器視窗 | 關閉 |

**範例：**

```bash
# 爬取 VitePress 網站
node scraper.js scrape vitepress --url https://vitepress.dev

# 爬取前 10 頁測試
node scraper.js scrape claude-code-cn --max-pages 10

# 指定輸出目錄
node scraper.js scrape docusaurus --url https://docusaurus.io --output ./my-docs
```

### `quick <url>` - 快速爬取

自動偵測網站類型，使用通用設定爬取：

```bash
node scraper.js quick https://any-docs-site.com
```

### `convert <input>` - 格式轉換

將已爬取的 Markdown 檔案轉換為其他格式：

```bash
# 轉換為 CSV
node scraper.js convert ./output/combined.md -f csv

# 轉換為 Anki 卡片
node scraper.js convert ./output/combined.md -f anki -o my-cards.txt
```

---

## 輸出格式說明

### Markdown (預設)
- **檔案**: `combined.md` + `content/*.md`
- **用途**: NotebookLM 匯入、一般閱讀
- **特點**: 保留原始結構，便於搜尋

### CSV
- **檔案**: `content.csv`
- **用途**: 試算表分析、資料處理
- **欄位**: Index, Title, URL, Content_Length, Key_Points

### Anki 卡片
- **檔案**: `anki-import.txt`
- **用途**: 間隔重複學習
- **格式**: Tab 分隔 (Question → Answer → Tags)
- **匯入方式**: Anki → File → Import

### Q&A 問答對
- **檔案**: `qa-pairs.csv`
- **用途**: 自我測驗、AI 訓練資料
- **欄位**: Chapter, Question, Answer, Context_URL

### JSON 資料
- **檔案**: `data.json`
- **用途**: 程式化處理、進階分析
- **內容**: 完整結構化資料

---

## 輸出格式範例

```bash
# 僅輸出 Markdown（預設）
node scraper.js scrape claude-code-cn

# 輸出所有格式 + Q&A
node scraper.js scrape claude-code-cn -f all --qa

# 只要 Anki 卡片
node scraper.js scrape vitepress --url https://vuejs.org -f anki
```

---

## 內建預設配置

### claude-code-cn
- **名稱**: Claude Code 中文教程
- **網址**: https://claudecode.tangshuang.net
- **適用**: 已配置完成，直接使用

### vitepress
- **名稱**: VitePress 文檔
- **適用**: VitePress 框架建構的文檔網站
- **用法**: `node scraper.js scrape vitepress --url <your-vitepress-site>`

### docusaurus
- **名稱**: Docusaurus 文檔
- **適用**: Meta Docusaurus 框架建構的文檔網站
- **用法**: `node scraper.js scrape docusaurus --url <your-docusaurus-site>`

### gitbook
- **名稱**: GitBook 文檔
- **適用**: GitBook 平台或 GitBook 風格的文檔
- **用法**: `node scraper.js scrape gitbook --url <your-gitbook-site>`

### readthedocs
- **名稱**: Read the Docs
- **適用**: Read the Docs 平台託管的文檔（常見於 Python 專案）
- **用法**: `node scraper.js scrape readthedocs --url <your-rtd-site>`

### nextra
- **名稱**: Nextra 文檔
- **適用**: Nextra (Next.js 文檔框架) 建構的網站
- **用法**: `node scraper.js scrape nextra --url <your-nextra-site>`

---

## 自定義配置

### 方法 1：使用命令列參數

```bash
node scraper.js scrape custom \
  --url https://example.com/docs \
  --content-selector ".main-content" \
  --link-selector ".sidebar a"
```

### 方法 2：編輯 presets.json

在 `presets.json` 中新增自定義預設：

```json
{
  "my-custom-site": {
    "name": "我的自定義網站",
    "url": "https://example.com",
    "indexPath": "/docs",
    "linkSelector": ".sidebar a",
    "linkFilter": "/docs/",
    "excludePatterns": ["#", "javascript:"],
    "contentSelector": ".markdown-body",
    "fallbackSelectors": ["article", "main"],
    "waitTime": 2000,
    "timeout": 30000
  }
}
```

**配置欄位說明：**

| 欄位 | 說明 |
|------|------|
| `name` | 顯示名稱 |
| `url` | 網站根網址 |
| `indexPath` | 文檔目錄頁路徑 |
| `linkSelector` | 連結的 CSS 選擇器 |
| `linkFilter` | 連結 URL 必須包含的字串 |
| `excludePatterns` | 排除的 URL 模式 |
| `contentSelector` | 主要內容的 CSS 選擇器 |
| `fallbackSelectors` | 備用內容選擇器（陣列） |
| `waitTime` | 頁面渲染等待時間 (ms) |
| `timeout` | 頁面載入超時時間 (ms) |

---

## 輸出結構

```
output/
├── combined.md          # 合併的完整 Markdown（匯入 NotebookLM 用）
├── content.csv          # CSV 格式（試算表分析）
├── anki-import.txt      # Anki 匯入檔（間隔重複學習）
├── qa-pairs.csv         # Q&A 問答對（自我測驗）
├── data.json            # JSON 結構化資料（程式處理）
└── content/             # 個別章節
    ├── 001-introduction.md
    ├── 002-getting-started.md
    └── ...
```

---

## 匯入 NotebookLM

1. 打開 [NotebookLM](https://notebooklm.google.com)
2. 建立新筆記本
3. 點擊「Add source」→「Upload」
4. 上傳 `combined.md` 檔案
5. 開始與文檔互動學習！

**注意**：
- NotebookLM 單一來源限制約 500KB
- 如果檔案過大，可分批上傳 `content/` 資料夾中的個別檔案

---

## 匯入 Anki

1. 打開 Anki 桌面版
2. 選擇 File → Import
3. 選取 `anki-import.txt` 檔案
4. 設定：
   - **Type**: Basic (and reversed card)
   - **Field separator**: Tab
   - **Allow HTML in fields**: 勾選
5. 點擊 Import

**卡片格式**：
- 正面：問題（如「什麼是 Claude Code？」）
- 背面：關鍵要點摘要
- 標籤：章節名稱

---

## 常見問題

### Q: 爬取時出現 Timeout 錯誤？

增加超時時間：
```bash
node scraper.js scrape <preset> --timeout 60000
```

### Q: 內容抓取不完整？

增加等待時間讓頁面完整渲染：
```bash
node scraper.js scrape <preset> --wait 3000
```

### Q: 如何只爬取部分頁面測試？

使用 `--max-pages` 參數：
```bash
node scraper.js scrape <preset> --max-pages 5
```

### Q: 想看到瀏覽器操作過程？

使用 `--no-headless` 顯示瀏覽器：
```bash
node scraper.js scrape <preset> --no-headless
```

### Q: 網站有反爬蟲機制？

1. 增加等待時間：`--wait 5000`
2. 減少並發：腳本已內建 300ms 間隔
3. 如仍被封鎖，可能需要手動處理

---

## 實用範例

### 範例 1：爬取 React 官方文檔

```bash
node scraper.js scrape custom \
  --url https://react.dev \
  --content-selector "article" \
  --link-selector "nav a[href*='/reference'], nav a[href*='/learn']" \
  --output ./downloads/react-docs
```

### 範例 2：爬取 Vue.js 文檔

```bash
node scraper.js scrape vitepress \
  --url https://vuejs.org \
  --output ./downloads/vue-docs
```

### 範例 3：爬取 Python 套件文檔

```bash
node scraper.js scrape readthedocs \
  --url https://requests.readthedocs.io \
  --output ./downloads/requests-docs
```

---

## 目錄結構

```
doc-scraper/
├── scraper.js      # 主程式
├── presets.json    # 預設配置檔
├── package.json    # 專案配置
├── README.md       # 本說明文件
└── downloads/      # 下載輸出目錄（執行後產生）
```

---

## 維護記錄

| 日期 | 版本 | 變更 |
|------|------|------|
| 2026-01-06 | 2.0.0 | 新增多格式輸出：CSV、Anki、Q&A、JSON；新增 convert 指令 |
| 2026-01-06 | 1.0.0 | 初始版本 |

---

## License

MIT License - 僅供個人學習使用
