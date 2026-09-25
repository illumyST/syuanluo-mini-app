// 將此值換成正式 Published LIFF ID 後，部署版本即可在正式 MINI App 中初始化。
const LIFF_ID = "2011747239-32DwtMu3";

const form = document.querySelector("#booking-form");
const serviceInputs = [...document.querySelectorAll('input[name="service"]')];
const dateInput = document.querySelector("#booking-date");
const timeSelect = document.querySelector("#booking-time");
const status = document.querySelector("#form-status");
const submitButton = form.querySelector('button[type="submit"]');

const taipeiDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
dateInput.min = taipeiDate;

const serviceDetails = {
  transfer: { name: "超渡", duration: "1.5 小時", price: "不收費" },
  numerology: { name: "生命靈數分析", duration: "2.5 小時", price: "NT$ 3,000" },
};

function selectedService() { return serviceInputs.find((input) => input.checked)?.value; }
function localDateParts(value) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function isFirstSundayOfQuarter(value) { if (!value) return false; const date = localDateParts(value); return [0, 3, 6, 9].includes(date.getMonth()) && date.getDay() === 0 && date.getDate() <= 7; }
function isWeekend(value) { const day = localDateParts(value).getDay(); return day === 0 || day === 6; }

function updateDateHint() {
  const service = selectedService();
  const hint = document.querySelector("#date-hint");
  if (service === "transfer") hint.textContent = "僅開放每年 1、4、7、10 月第一個週日。";
  else if (service === "numerology") hint.textContent = "平日晚上或假日白天皆可選擇。";
  else hint.textContent = "請先選擇服務，再選擇日期。";
}

function setTimeOptions(options, placeholder) {
  timeSelect.innerHTML = "";
  const initial = new Option(placeholder, ""); initial.disabled = true; initial.selected = true; timeSelect.add(initial);
  options.forEach(({ value, label }) => timeSelect.add(new Option(label, value)));
  timeSelect.disabled = options.length === 0;
}

function updateAvailability() {
  const service = selectedService(); const date = dateInput.value;
  if (!service || !date) { setTimeOptions([], "請先選擇服務與日期"); return; }
  if (service === "transfer") {
    if (isFirstSundayOfQuarter(date)) setTimeOptions([{ value:"afternoon", label:"下午時段（1.5 小時，詳細時間另行確認）" }], "請選擇時段");
    else setTimeOptions([], "此服務僅開放季度第一個週日下午");
    return;
  }
  if (isWeekend(date)) setTimeOptions([{ value:"daytime", label:"假日白天（2.5 小時，詳細時間另行確認）" }], "請選擇時段");
  else setTimeOptions([{ value:"evening", label:"平日晚上（2.5 小時，詳細時間另行確認）" }], "請選擇時段");
}

function errorFor(input) {
  const map = { "booking-date":"date-error", "booking-time":"time-error", "customer-name":"name-error", "customer-phone":"phone-error", "privacy-consent":"privacy-error" };
  return document.querySelector(`#${map[input.id]}`);
}
function setError(input, message) { input.setAttribute("aria-invalid", "true"); const error = errorFor(input); if (error) error.textContent = message; }
function clearError(input) { input.removeAttribute("aria-invalid"); const error = errorFor(input); if (error) error.textContent = ""; }

serviceInputs.forEach((input) => input.addEventListener("change", () => { document.querySelector("#service-error").textContent = ""; updateDateHint(); updateAvailability(); }));
dateInput.addEventListener("change", updateAvailability);
[dateInput, timeSelect, ...["customer-name","customer-phone","privacy-consent"].map((id) => document.querySelector(`#${id}`))].forEach((input) => {
  input.addEventListener("blur", () => { if (!input.validity.valid) setError(input, "請完成此欄位。"); });
  input.addEventListener("input", () => { if (input.validity.valid) clearError(input); });
  input.addEventListener("change", () => { if (input.validity.valid) clearError(input); });
});

async function initLiff() {
  if (!window.liff) return;
  try {
    await liff.init({ liffId: LIFF_ID });
    if (liff.isLoggedIn()) {
      const profile = await liff.getProfile();
      const name = document.querySelector("#customer-name");
      if (!name.value) name.value = profile.displayName;
    }
  } catch (error) { console.info("LIFF will initialize after the Endpoint URL is configured.", error); }
}

form.addEventListener("submit", (event) => {
  event.preventDefault(); status.textContent = "";
  const service = selectedService();
  if (!service) { document.querySelector("#service-error").textContent = "請選擇一項服務。"; serviceInputs[0].focus(); return; }
  const controls = [dateInput, timeSelect, document.querySelector("#customer-name"), document.querySelector("#customer-phone"), document.querySelector("#privacy-consent")];
  let invalid = false;
  controls.forEach((input) => { if (!input.validity.valid) { setError(input, "請完成此欄位。"); invalid = true; } });
  if (invalid) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
  const data = Object.fromEntries(new FormData(form));
  const request = { ...data, serviceName:serviceDetails[service].name, duration:serviceDetails[service].duration, price:serviceDetails[service].price, submittedAt:new Date().toISOString() };
  // 靜態版僅存於本裝置，正式版改為 POST 至受保護的後端 API。
  localStorage.setItem("syuanluo-latest-booking-request", JSON.stringify(request));
  submitButton.disabled = true;
  status.textContent = `已收到 ${request.serviceName} 的預約申請；我們將與你確認 ${request.date} 的時段。`;
  submitButton.textContent = "預約申請已送出";
});

initLiff();
