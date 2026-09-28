/**
 * 管理後台：搭配 admin.html 使用。
 * 閱讀順序：共用 API 請求 → 預約卡片與審核 → 清單查詢 → 登入初始化。
 */
// 與預約前台使用同一個 LIFF ID；API 網址由 config.js 提供。
const LIFF_ID = "2011747239-32DwtMu3",
  API = window.SYUANLUO_API_BASE_URL || "";
// 保存這次頁面登入取得的 access token，API 呼叫會共用它。
let token = "";
// 清單、載入提示、登入提示及篩選欄位，分別對應 admin.html 的 id。
const list = document.querySelector("#booking-list"),
  info = document.querySelector("#list-status"),
  auth = document.querySelector("#auth-status"),
  status = document.querySelector("#status-filter"),
  date = document.querySelector("#date-filter");
// 把資料庫／API 使用的英文代碼轉成畫面可讀的中文。
const labels = {
  afternoon: "下午時段",
  daytime: "假日白天",
  evening: "平日晚上",
  pending: "待確認",
  confirmed: "已確認",
  needs_information: "需補資料",
  rejected: "無法安排",
};
// 集中處理 API：補上登入標頭、解析 JSON，並把非成功回應轉成錯誤。
// options 可指定方法與主體；未指定方法時 fetch 預設為 GET。
async function request(path, options = {}) {
  if (!API) throw Error("尚未設定 Cloudflare Worker 網址。請更新 config.js。");
  const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    }),
    data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "操作失敗。");
  return data;
}
// b 是一筆預約；建立包含資料、回覆文字與三種處理按鈕的卡片。
function card(b) {
  const item = document.createElement("article");
  item.className = "booking";
  const title = document.createElement("h3");
  // 使用 textContent 顯示資料，使用者輸入不會被當成 HTML 執行。
  title.textContent = `${b.service_name}｜${labels[b.status]}`;
  item.append(title);
  [
    ["日期", b.booking_date],
    ["時段", labels[b.time_slot]],
    ["姓名", b.customer_name],
    ["電話", b.customer_phone],
    ["備註", b.customer_note || "—"],
  ].forEach(([key, value]) => {
    const p = document.createElement("p");
    p.textContent = `${key}：${value}`;
    item.append(p);
  });
  // 每張卡片各有一個回覆表單，先帶入已儲存的管理者備註。
  const form = document.createElement("form");
  form.className = "reply";
  const note = document.createElement("textarea");
  note.placeholder = "回覆說明（選填）";
  note.maxLength = 500;
  note.value = b.admin_note || "";
  form.append(note);
  // 三個按鈕共用 submit 事件，用 data-status 記住各自要送出的狀態。
  const actions = document.createElement("div");
  actions.className = "actions";
  [
    ["confirmed", "確認並通知"],
    ["needs_information", "請補資料"],
    ["rejected", "無法安排"],
  ].forEach(([state, label]) => {
    const button = document.createElement("button");
    button.type = "submit";
    button.dataset.status = state;
    button.textContent = label;
    actions.append(button);
  });
  form.append(actions);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // submitter 指出實際按下哪顆按鈕；沒有按鈕來源時不進行更新。
    const chosen = e.submitter;
    if (!chosen) return;
    // 請求完成前鎖住此卡片的所有動作，避免同時送出不同狀態。
    actions.querySelectorAll("button").forEach((x) => (x.disabled = true));
    try {
      // PATCH 更新指定預約的狀態與備註；成功後重新套用目前篩選條件載入清單。
      await request(`/bookings/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: chosen.dataset.status, admin_note: note.value }),
      });
      load();
    } catch (error) {
      info.textContent = error.message;
      actions.querySelectorAll("button").forEach((x) => (x.disabled = false));
    }
  });
  item.append(form);
  return item;
}
// 清空舊卡片，按狀態及選填日期查詢，再顯示筆數、卡片或無資料提示。
async function load() {
  info.textContent = "載入中…";
  list.replaceChildren();
  try {
    // URLSearchParams 負責組合與編碼查詢字串；沒有選日期就不加入日期條件。
    const query = new URLSearchParams({ status: status.value });
    if (date.value) query.set("date", date.value);
    const { bookings } = await request(`/bookings?${query}`);
    document.querySelector("#booking-count").textContent = `${bookings.length} 筆`;
    info.textContent = "";
    if (!bookings.length) {
      info.textContent = "沒有符合條件的預約。";
      return;
    }
    bookings.forEach((b) => list.append(card(b)));
  } catch (error) {
    info.textContent = error.message;
  }
}
// 先初始化 LIFF；尚未登入就轉到 LINE 登入，登入後再取得 token 並查詢清單。
async function init() {
  if (!API) {
    auth.textContent = "尚未設定 Cloudflare Worker 網址。";
    return;
  }
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    token = liff.getAccessToken() || "";
    if (!token) throw Error("無法取得 LINE 登入資訊。");
    // 這裡實際只確認取得 token；是否為管理員，仍由 load 呼叫的 Worker API 判定。
    auth.textContent = "管理權限已確認。";
    load();
  } catch (error) {
    auth.textContent = error.message || "無法確認管理權限。";
  }
}
// 手動重新整理、狀態變更與日期變更皆共用 load；最後啟動登入流程。
document.querySelector("#refresh-button").addEventListener("click", load);
status.addEventListener("change", load);
date.addEventListener("change", load);
init();
