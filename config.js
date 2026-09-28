/**
 * 前台與管理後台共用的公開設定，必須比 app.js／admin.js 更早載入。
 * 透過 window 分享 API 根網址，各頁再接上 /bookings 路徑，因此網址結尾不要加斜線。
 */
// 部署 Worker 後填入公開網址；此檔案不含任何密鑰。
window.SYUANLUO_API_BASE_URL = "https://syuanluo-booking-api.syuanluo.workers.dev";
