# 玹㼈的太極能量空間｜預約 MINI App

可直接部署的靜態 LIFF 預約申請頁。

## 目前功能

- 超渡：只允許 1、4、7、10 月第一個週日的下午時段。
- 生命靈數分析：平日晚上或假日白天。
- 在 LINE MINI App 中，以 Developing LIFF ID 初始化並帶入 LINE 顯示名稱。
- 隱私權政策與服務條款頁面。

## 重要限制

此版為靜態「預約申請」原型：送出資料只會存在使用者當前瀏覽器的 localStorage，並不會通知服務方、鎖定時段或處理付款。正式上線前，必須接上受保護的後端資料庫、LINE 通知與金流。

## 部署

### Vercel

將本資料夾推送至 GitHub，於 Vercel 匯入該 repository。Framework Preset 選 `Other`，Build Command 留空、Output Directory 留空。部署網址填入 LINE Developers Console 的 **Web app settings → Endpoint URL → Developing**。

### GitHub Pages

推送至 GitHub repository 後，在 Settings → Pages 選擇 `Deploy from a branch`，branch 選 `main` 與 `/ (root)`。取得的 `https://<帳號>.github.io/<repository>/` 也可作為 Developing Endpoint URL。

部署後，以 LINE MINI App 的 Developing LIFF URL 開啟測試。
