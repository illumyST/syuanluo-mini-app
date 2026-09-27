# 玹㼈的太極能量空間｜預約 MINI App

可直接部署的靜態 LIFF 預約申請頁。

## 目前功能

- 超渡：只允許 1、4、7、10 月第一個週日的下午時段。
- 生命靈數分析：平日晚上或假日白天。
- 在 LINE MINI App 中，以 Developing LIFF ID 初始化並帶入 LINE 顯示名稱。
- 隱私權政策與服務條款頁面。

## 重要限制

表單會送至 Cloudflare Worker，寫入 D1 資料庫；管理員在 `admin.html` 確認預約後，Worker 透過 LINE 官方帳號通知填表人。

## Cloudflare 設定

在 `worker/` 執行：

1. `npm install`、`npx wrangler login`
2. `npm run db:create`，把輸出的 `database_id` 填入 `worker/wrangler.toml`
3. `npm run db:migrate:remote`
4. 依序設定 secrets：`npx wrangler secret put LINE_MINI_APP_CHANNEL_ID`、`npx wrangler secret put LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`、`npx wrangler secret put ADMIN_LINE_USER_ID`
5. `npm run deploy`，把輸出的 Worker URL 填入根目錄 `config.js`

LINE Messaging API Channel 與 MINI App 必須同一 Provider；管理員也必須先加入官方帳號好友，才能收到新申請通知。

## 部署

### Vercel

將本資料夾推送至 GitHub，於 Vercel 匯入該 repository。Framework Preset 選 `Other`，Build Command 留空、Output Directory 留空。部署網址填入 LINE Developers Console 的 **Web app settings → Endpoint URL → Developing**。

### GitHub Pages

推送至 GitHub repository 後，在 Settings → Pages 選擇 `Deploy from a branch`，branch 選 `main` 與 `/ (root)`。取得的 `https://<帳號>.github.io/<repository>/` 也可作為 Developing Endpoint URL。

部署後，以 LINE MINI App 的 Developing LIFF URL 開啟測試。
