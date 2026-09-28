/**
 * 預約前台：搭配 index.html 使用。
 * 閱讀順序：畫面元素與服務資料 → 日期／時段規則 → 欄位提示 → LINE 初始化 → 送出流程。
 */
// 將此值換成正式 Published LIFF ID 後，部署版本即可在正式 MINI App 中初始化。
// https://developers.line.biz/console/channel/2011747239/mini-liff
const LIFF_ID = "2011747239-32DwtMu3";
// 後端網址由先載入的 config.js 提供；未設定時使用空字串，送出前再顯示提示。
const API_BASE_URL = window.SYUANLUO_API_BASE_URL || "";

// 先取得會反覆操作的畫面元素；# 對應 HTML 的 id，name="service" 對應服務單選群組。
const form = document.querySelector("#booking-form");
const serviceInputs = [...document.querySelectorAll('input[name="service"]')];
const dateInput = document.querySelector("#booking-date");
const timeSelect = document.querySelector("#booking-time");
const status = document.querySelector("#form-status");
const submitButton = form.querySelector('button[type="submit"]');

// 用台北的今天限制日期欄位下限，避免使用者選到過去日期。
const taipeiDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
dateInput.min = taipeiDate;

// 服務代碼對應顯示資訊；目前送出成功的訊息只使用 name。
const serviceDetails = {
  transfer: { name: "超渡", duration: "1.5 小時", price: "不收費" },
  numerology: { name: "生命靈數分析", duration: "2.5 小時", price: "NT$ 3,000" },
};

// 找出勾選的服務；尚未選擇時，?. 讓結果為 undefined 而不拋出錯誤。
function selectedService() {
  return serviceInputs.find((input) => input.checked)?.value;
}
// 把 YYYY-MM-DD 拆成數字，以瀏覽器本地日期建立 Date；月份索引從 0 開始。
function localDateParts(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
// 超渡開放條件：1、4、7、10 月，星期日，且日期介於 1～7 日。
function isFirstSundayOfQuarter(value) {
  if (!value) return false;
  const date = localDateParts(value);
  return [0, 3, 6, 9].includes(date.getMonth()) && date.getDay() === 0 && date.getDate() <= 7;
}
// Date 的星期編號：0 是週日，6 是週六。
function isWeekend(value) {
  const day = localDateParts(value).getDay();
  return day === 0 || day === 6;
}

// 切換服務時同步更新日期說明，讓使用者先知道可預約規則。
function updateDateHint() {
  const service = selectedService();
  const hint = document.querySelector("#date-hint");
  if (service === "transfer") hint.textContent = "僅開放每年 1、4、7、10 月第一個週日。";
  else if (service === "numerology") hint.textContent = "平日晚上或假日白天皆可選擇。";
  else hint.textContent = "請先選擇服務，再選擇日期。";
}

// 重建時段選單，清掉上一個日期的選擇；空值提示不能當成有效時段。
// 沒有可用時段就停用選單。
function setTimeOptions(options, placeholder) {
  timeSelect.innerHTML = "";
  const initial = new Option(placeholder, "");
  initial.disabled = true;
  initial.selected = true;
  timeSelect.add(initial);
  options.forEach(({ value, label }) => timeSelect.add(new Option(label, value)));
  timeSelect.disabled = options.length === 0;
}

// 依服務與日期推導時段；這裡只套用開放規則，沒有查詢資料庫的剩餘名額。
function updateAvailability() {
  const service = selectedService();
  const date = dateInput.value;
  if (!service || !date) {
    setTimeOptions([], "請先選擇服務與日期");
    return;
  }
  // 超渡只提供季度第一個週日下午；處理完直接 return，避免套用靈數的規則。
  if (service === "transfer") {
    if (isFirstSundayOfQuarter(date))
      setTimeOptions(
        [{ value: "afternoon", label: "下午時段（1.5 小時，詳細時間另行確認）" }],
        "請選擇時段",
      );
    else setTimeOptions([], "此服務僅開放季度第一個週日下午");
    return;
  }
  // 生命靈數分析：週末提供白天，平日提供晚上。
  if (isWeekend(date))
    setTimeOptions(
      [{ value: "daytime", label: "假日白天（2.5 小時，詳細時間另行確認）" }],
      "請選擇時段",
    );
  else
    setTimeOptions(
      [{ value: "evening", label: "平日晚上（2.5 小時，詳細時間另行確認）" }],
      "請選擇時段",
    );
}

// 將輸入欄位 id 對應到它下方顯示錯誤的段落。
function errorFor(input) {
  const map = {
    "booking-date": "date-error",
    "booking-time": "time-error",
    "customer-name": "name-error",
    "customer-phone": "phone-error",
    "privacy-consent": "privacy-error",
  };
  return document.querySelector(`#${map[input.id]}`);
}
// 同時更新輔助科技可讀取的無效狀態與畫面上的錯誤文字。
function setError(input, message) {
  input.setAttribute("aria-invalid", "true");
  const error = errorFor(input);
  if (error) error.textContent = message;
}
// 欄位恢復有效時，移除無效狀態並清空提示。
function clearError(input) {
  input.removeAttribute("aria-invalid");
  const error = errorFor(input);
  if (error) error.textContent = "";
}

// 服務變更時清除服務錯誤，並重算日期提示與時段；日期變更只需重算時段。
serviceInputs.forEach((input) =>
  input.addEventListener("change", () => {
    document.querySelector("#service-error").textContent = "";
    updateDateHint();
    updateAvailability();
  }),
);
dateInput.addEventListener("change", updateAvailability);
// 離開欄位時檢查 HTML 的 required 等限制；輸入或選擇正確後即清除錯誤。
[
  dateInput,
  timeSelect,
  ...["customer-name", "customer-phone", "privacy-consent"].map((id) =>
    document.querySelector(`#${id}`),
  ),
].forEach((input) => {
  input.addEventListener("blur", () => {
    if (!input.validity.valid) setError(input, "請完成此欄位。");
  });
  input.addEventListener("input", () => {
    if (input.validity.valid) clearError(input);
  });
  input.addEventListener("change", () => {
    if (input.validity.valid) clearError(input);
  });
});

// 登入憑證暫存在此頁記憶體，送出時交給 Worker 向 LINE 驗證身分。
let lineAccessToken = "";
// 初始化 LINE LIFF SDK；已登入時取得憑證，並以 LINE 名稱預填空白姓名。
// 這個前台函式不會主動呼叫 login；沒有 SDK 或未登入時仍可瀏覽表單。
async function initLiff() {
  if (!window.liff) return;
  try {
    await liff.init({ liffId: LIFF_ID });
    if (liff.isLoggedIn()) {
      lineAccessToken = liff.getAccessToken() || "";
      const profile = await liff.getProfile();
      const name = document.querySelector("#customer-name");
      // 保留使用者已輸入的姓名，避免非同步取得的個人資料覆蓋它。
      if (!name.value) name.value = profile.displayName;
    }
  } catch (error) {
    console.info("LIFF will initialize after the Endpoint URL is configured.", error);
  }
}

// 送出流程：攔截表單換頁 → 檢查欄位與登入 → POST 預約 → 顯示結果。
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  const service = selectedService();
  if (!service) {
    document.querySelector("#service-error").textContent = "請選擇一項服務。";
    serviceInputs[0].focus();
    return;
  }
  // 逐欄使用瀏覽器的 validity 檢查 HTML 限制；有錯誤就聚焦第一個錯誤欄位。
  const controls = [
    dateInput,
    timeSelect,
    document.querySelector("#customer-name"),
    document.querySelector("#customer-phone"),
    document.querySelector("#privacy-consent"),
  ];
  let invalid = false;
  controls.forEach((input) => {
    if (!input.validity.valid) {
      setError(input, "請完成此欄位。");
      invalid = true;
    }
  });
  if (invalid) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }
  // 後端網址與 LINE 憑證皆存在時，才發出 API 請求。
  if (!API_BASE_URL) {
    status.textContent = "預約系統正在設定中，請稍後再試。";
    return;
  }
  if (!lineAccessToken) {
    status.textContent = "請從 LINE MINI App 重新開啟後再送出。";
    return;
  }
  // FormData 以欄位 name 為鍵；同意框勾選後會帶 privacy="on"。
  // Object.fromEntries 將欄位轉為可序列化成 JSON 的一般物件。
  const data = Object.fromEntries(new FormData(form));
  // 送出期間停用按鈕，防止連點；失敗才重新開放重試。
  submitButton.disabled = true;
  submitButton.textContent = "送出中…";
  try {
    // 以 Bearer 標頭附上 LINE 憑證，表單資料則放在 JSON 請求主體。
    const response = await fetch(`${API_BASE_URL}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineAccessToken}` },
      body: JSON.stringify(data),
    });
    // 即使回應不是 JSON 也保留通用錯誤訊息；fetch 的 HTTP 錯誤需自行檢查 ok。
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "目前無法送出預約，請稍後再試。");
    // 成功只代表收到申請，仍需管理者確認；按鈕保持停用，避免重複送出。
    status.textContent = `已收到 ${serviceDetails[service].name} 的預約申請；我們將透過 LINE 與你確認。`;
    submitButton.textContent = "預約申請已送出";
  } catch (error) {
    status.textContent = error.message || "目前無法送出預約，請稍後再試。";
    submitButton.disabled = false;
    submitButton.textContent = "送出預約申請 →";
  }
});

// 頁面元素與事件準備好後，開始非同步初始化 LINE。
initLiff();
