# LINE MINI App 技術說明

本專案使用原生 HTML、CSS、JavaScript 與 LINE LIFF SDK。前端透過 GitHub Actions 部署至 GitHub Pages；後端以 Cloudflare Workers 提供 JSON API，並透過 `DB` binding 存取 Cloudflare D1。

## 專案結構

```text
.
├── .github/workflows/deploy-pages.yml  # GitHub Pages 部署流程
├── index.html / app.js / styles.css   # 使用者介面
├── admin.html / admin.js / admin.css  # 管理介面
├── privacy.html / terms.html / legal.css
├── config.js                         # 前端使用的 Worker URL
└── worker/
    ├── src/index.js                  # API、LINE 驗證與推播
    ├── schema.sql                    # D1 資料表與索引初始化 SQL
    ├── wrangler.toml                 # Worker、D1 binding 與 CORS 設定
    ├── package.json                  # Worker 工具與執行指令
    └── pnpm-lock.yaml                # 依賴版本鎖定
```

前端沒有套件安裝或編譯步驟。套件管理使用 **pnpm**，指令於 `worker/` 執行。

## 現有設定

| 項目 | 設定位置與用途 |
| --- | --- |
| Worker | `worker/wrangler.toml`：名稱為 `syuanluo-booking-api`，入口為 `src/index.js` |
| D1 | 同檔已填入 `syuanluo-booking` 的 `database_id`，程式透過 `env.DB` 存取 |
| CORS | 同檔的 `ALLOWED_ORIGINS` 目前為 `https://illumyst.github.io` |
| API URL | `config.js` 已設定 HTTPS 的 `workers.dev` 網址 |
| LIFF ID | `app.js` 與 `admin.js` 各自設定 `LIFF_ID`，更換時需同步修改 |
| 前端部署 | `.github/workflows/deploy-pages.yml`，推送至 `main` 或手動觸發 |

以下部署流程以沿用既有 Cloudflare Worker、遠端 D1 與 secrets 為前提。

## Cloudflare Worker 部署

### 安裝工具與登入

從專案根目錄執行：

```bash
cd worker
pnpm install --frozen-lockfile
```

Node.js 請使用 22.12 以上版本：目前 lockfile 鎖定的 Wrangler 4.141.0 要求 Node.js 22 以上，oxlint 與 oxfmt 在 Node.js 22 系列則要求至少 22.12。

若本機尚未登入 Cloudflare，執行 `pnpm exec wrangler login`。以下指令都在 `worker/` 內執行。

### 更新既有 Worker

確認 `wrangler.toml` 的 D1 binding 與 CORS 設定後部署：

```bash
pnpm run deploy
```

此指令執行 `wrangler deploy`，只部署 Worker；不會初始化 D1 schema，也不會部署 GitHub Pages。日常程式更新不需要重建資料庫或重新設定未變更的 secrets。

`ALLOWED_ORIGINS` 可用逗號分隔多個來源。來源只包含協定、主機與必要的連接埠，不包含路徑或結尾斜線。例如 GitHub Pages 網址即使包含 repository 路徑，來源仍是 `https://illumyst.github.io`。修改後需重新部署 Worker。

若 Worker 網址改變，更新根目錄 `config.js` 的 `window.SYUANLUO_API_BASE_URL`（不含結尾斜線），再部署前端。

### Worker 環境變數

Worker 使用 Cloudflare 上的以下設定；日常部署沿用既有值：

| 名稱 | 用途 |
| --- | --- |
| `LINE_MINI_APP_CHANNEL_ID` | 比對 LINE token 所屬的 MINI App Channel；不是 LIFF ID |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | 呼叫 LINE Messaging API 的憑證 |
| `ADMIN_LINE_USER_IDS` | LINE 官方帳號推播通知的收件人清單；從 Messaging API 取得，以逗號分隔多個 ID |
| `ADMIN_MINI_APP_USER_IDS` | 管理後台權限清單；從 MINI App 成功送出的預約資料取得，以逗號分隔多個 ID |
| `ADMIN_LINE_USER_ID`、`ADMIN_MINI_APP_USER_ID` | 舊版單一管理者設定；保留相容性，完成轉換後可刪除 |

## GitHub Pages 部署

專案已有自訂 workflow，repository 的 **Settings → Pages → Build and deployment → Source** 應選擇 **GitHub Actions**，與現有流程搭配。[GitHub 官方設定說明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

推送至 `main`，或在 Actions 手動執行 `Deploy static site to GitHub Pages`，會依序：

1. 取出 repository。
2. 將 workflow 明確列出的 HTML、CSS、JavaScript 複製到 `_site/`。
3. 上傳 Pages artifact 並部署。

流程不執行前端 build，也不發布 `worker/`。新增需要公開的靜態檔案時，需同步更新 workflow 的 `cp` 清單。

部署後，確認 `config.js` 指向正確的 Worker URL，且 Worker 的 `ALLOWED_ORIGINS` 包含網站來源。LINE Developers Console 的 MINI App Endpoint URL 則需指向完整的前端 HTTPS 網址，包含必要的 repository 路徑。

## API 與驗證

| 方法 | 路徑 | 驗證 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/health` | 無 | 回傳 `{"ok":true}` |
| `POST` | `/bookings` | LINE access token | 新增資料 |
| `GET` | `/bookings` | 管理員 | 查詢資料，支援 `status`、`date` |
| `PATCH` | `/bookings/:id` | 管理員 | 更新資料 |
| `OPTIONS` | 所有路徑 | 無 | 回應 CORS 預檢請求 |

資料 API 使用 `Authorization: Bearer <LINE access token>`。Worker 向 LINE 驗證 token、比對 Channel ID，再取得 profile；管理 API 額外比對 `ADMIN_MINI_APP_USER_IDS`。CORS 只控制瀏覽器跨來源讀取，不能取代上述身分驗證。新預約會推播給 `ADMIN_LINE_USER_IDS` 中的所有收件人。

### 使用者預約流程

```mermaid
flowchart TD
    U[使用者在 LINE 開啟<br/>MINI App] --> F[填寫並送出預約表單]
    F -->|LIFF access token 與表單資料| W[Cloudflare Worker]
    W --> V{向 LINE 驗證<br/>token 與 Channel ID}
    V -->|失敗| E[顯示身分驗證失敗]
    V -->|成功| P[取得使用者 MINI App userId]
    P --> D1[寫入 D1 bookings]
    D1 --> N[讀取 ADMIN_LINE_USER_IDS]
    N --> API[LINE Messaging API]
    API --> A[通知所有管理者<br/>有新的預約]
```

### 管理者處理流程

```mermaid
flowchart TD
    A[管理者在 LINE 開啟<br/>admin.html] --> T[取得 LIFF access token]
    T --> W[Cloudflare Worker]
    W --> V{向 LINE 驗證<br/>token 與 Channel ID}
    V -->|失敗| E[顯示身分驗證失敗]
    V -->|成功| C{userId 位於<br/>ADMIN_MINI_APP_USER_IDS？}
    C -->|否| X[顯示沒有管理權限]
    C -->|是| L[從 D1 讀取預約清單]
    L --> S[確認／請補資料／婉拒]
    S --> D1[更新 D1 預約狀態與回覆]
    D1 --> API[LINE Messaging API]
    API --> U[填表使用者收到結果]
```

### 管理者角色與通知名單

```mermaid
flowchart LR
    R[LINE Developers<br/>AdminMemberTester] -. 可管理頻道與測試 Mini App .-> C[LINE Developers Console]
    R -. 不會提供 userId 或通知收件人 .-> N[ADMIN_LINE_USER_IDS]
    M[管理者的 MINI App userId] --> P[ADMIN_MINI_APP_USER_IDS<br/>可進管理後台]
    O[管理者的 Messaging API userId] --> N[ADMIN_LINE_USER_IDS<br/>接收新預約通知]
```

`ADMIN_MINI_APP_USER_IDS` 控制誰能使用管理後台；`ADMIN_LINE_USER_IDS` 決定誰會收到新預約通知。LINE Developers 的角色名單不會自動成為 Messaging API 的推播收件人。

推播透過 `ctx.waitUntil()` 背景執行，失敗會記錄到 log；API 寫入成功不代表通知已送達。

## 檢查與維護

在 `worker/` 執行：

```bash
pnpm run lint
pnpm run format:check
```

以上只檢查 `worker/src`。需要自動格式化時使用 `pnpm run format`，會修改該目錄的程式碼。

可檢查目前設定的 Worker 健康端點：

```bash
curl https://syuanluo-booking-api.syuanluo.workers.dev/health
```

預期回應為 `{"ok":true}`；此端點不查詢 D1，也不呼叫 LINE，因此不能用來確認資料庫、驗證或推播是否正常。

查看 Worker 即時記錄：

```bash
pnpm exec wrangler tail
```

## 程式閱讀順序與註解

各程式檔已補上繁體中文註解，說明檔案用途、函式、條件判斷與資料流。建議先讀 `index.html` 的表單結構，再讀 `app.js` 的日期規則及送出事件；接著閱讀 `worker/src/index.js` 的身分驗證與 API 路由，最後讀 `admin.js` 的清單與審核流程。

CSS 註解說明各區塊外觀、選取狀態、鍵盤焦點及手機／桌面配置；`worker/schema.sql`、`worker/wrangler.toml` 與 Pages workflow 則說明資料保存和部署流程。

JSON 格式不支援註解，以下設定保留原格式，改在此說明：

- `worker/package.json`：`private` 避免誤發布套件；`type: module` 讓 JavaScript 使用 ES module。`dev` 啟動本機 Worker、`deploy` 部署、`db:create` 建立 D1、`db:migrate:remote` 對遠端 D1 執行 schema；`lint` 檢查程式、`format` 整理縮排、`format:check` 只檢查格式。`devDependencies` 列出開發工具。
- `worker/.oxfmtrc.json`：目前為空物件，表示採用 oxfmt 預設格式設定。

依賴鎖定檔由套件管理工具維護，不手動加註解。
