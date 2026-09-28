/**
 * 預約 API：前台 POST 新增，管理後台 GET 查詢／PATCH 審核。
 * 共用工具負責 JSON、日期、LINE 身分與通知；fetch 依 HTTP 方法及路徑分派。
 */
// 服務白名單與各服務允許的時段代碼；前端顯示限制後，後端仍需重新檢查。
const services = {
  transfer: { name: "超渡", slots: ["afternoon"] },
  numerology: { name: "生命靈數分析", slots: ["daytime", "evening"] },
};
// 通知用的時段文字，代碼與前端送來的 time 相對應。
const slots = {
  afternoon: "下午時段（詳細時間另行確認）",
  daytime: "假日白天（詳細時間另行確認）",
  evening: "平日晚上（詳細時間另行確認）",
};
// 管理者可設定的三種結果；新申請的 pending 由新增流程指定。
const statusLabels = {
  confirmed: "已確認",
  needs_information: "需要補充資料",
  rejected: "暫時無法安排",
};
// 統一把物件轉成 JSON Response，預設 HTTP 狀態為 200。
const result = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
// 只接受字串，去除兩端空白並截斷至長度上限；其他型別轉為空字串。
const trim = (value, size) => (typeof value === "string" ? value.trim().slice(0, size) : "");
// 把逗號分隔的管理者設定轉為陣列，同時去空白與空項目。
const ids = (value) =>
  String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
// 只對允許的 Origin 回傳跨來源標頭；CORS 控制瀏覽器讀取，不取代身分驗證。
// 不在名單時仍會進入路由流程，只是不附上允許跨來源的標頭。
function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((x) => x.trim())
    .includes(origin)
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        vary: "Origin",
      }
    : {};
}
// 保留原本 JSON 回應的標頭與狀態，再合併 CORS 標頭。
function respond(response, headers) {
  const merged = new Headers(response.headers);
  Object.entries(headers).forEach(([key, value]) => merged.set(key, value));
  return new Response(response.body, { status: response.status, headers: merged });
}
// 明確以台北時區組出 YYYY-MM-DD，避免 Worker 執行地區影響「今天」。
function today() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
// 先檢查格式，再比對 UTC 日期各部分；例如 2 月 30 日會被 Date 自動進位，需拒絕。
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : null;
}
// 固定格式日期可直接比較字串先後；不接受過去日期，超渡另檢查季度第一個週日。
// 靈數在此只確認服務代碼，沒有進一步綁定週末白天／平日晚上。
function validRule(service, value) {
  const date = validDate(value);
  if (!date || value < today()) return false;
  return service === "transfer"
    ? [0, 3, 6, 9].includes(date.getUTCMonth()) && date.getUTCDay() === 0 && date.getUTCDate() <= 7
    : service === "numerology";
}
// 驗證流程：取 Bearer token → LINE 驗證 → 比對 Channel → 取得 profile → 選擇性檢查管理員。
// 失敗回傳 null，路由再決定回傳 401 或 403；不採信前端傳來的 userId。
async function user(request, env, admin = false) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/, "");
  if (!token) {
    console.log("line-auth:no-access-token");
    return null;
  }
  // 向 LINE 查核 access token，而非只憑前端說「已登入」。
  const verifyUrl = new URL("https://api.line.me/oauth2/v2.1/verify");
  verifyUrl.searchParams.set("access_token", token);
  const verified = await fetch(verifyUrl);
  if (!verified.ok) {
    console.log(`line-auth:verify-failed:${verified.status}`);
    return null;
  }
  const verification = await verified.json();
  // token 必須屬於設定的 MINI App Channel；Channel ID 與 LIFF ID 是不同設定。
  if (String(verification.client_id) !== String(env.LINE_MINI_APP_CHANNEL_ID)) {
    console.log("line-auth:channel-id-mismatch");
    return null;
  }
  const profile = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!profile.ok) {
    console.log(`line-auth:profile-failed:${profile.status}`);
    return null;
  }
  const data = await profile.json();
  // 管理員權限使用 MINI App 的 userId 名單；支援多筆新設定與舊版單筆設定。
  const adminIds = ids(env.ADMIN_MINI_APP_USER_IDS || env.ADMIN_MINI_APP_USER_ID);
  if (admin && !adminIds.includes(data.userId)) {
    console.log("line-auth:not-admin");
    return null;
  }
  return data;
}
// 透過 Messaging API 推播文字；未設定憑證或收件人時略過，HTTP 失敗則拋出錯誤。
async function push(env, to, text) {
  if (!env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN || !to) return;
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!response.ok) throw new Error(`LINE Push ${response.status}`);
}
// 通知收件名單與後台權限名單分開。allSettled 等待每筆結果，個別失敗不會中斷其他推播。
// 此處未檢查回傳結果，所以個別收件人的失敗不會由外層 catch 記錄。
async function pushAdmins(env, text) {
  const recipients = ids(env.ADMIN_LINE_USER_IDS || env.ADMIN_LINE_USER_ID);
  await Promise.allSettled(recipients.map((userId) => push(env, userId, text)));
}
// 按審核狀態組合顧客通知；有管理者備註才加入，最後以換行串接非空段落。
function customerText(booking) {
  return [
    `【預約${statusLabels[booking.status]}】`,
    `${booking.service_name}｜${booking.booking_date}｜${slots[booking.time_slot]}`,
    booking.status === "confirmed" ? "您的預約申請已確認。" : "我們已查看您的預約申請。",
    booking.admin_note ? `說明：${booking.admin_note}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
// Cloudflare Worker 入口：request 是 HTTP 請求，env 提供 DB 與設定，ctx 管理背景工作。
export default {
  async fetch(request, env, ctx) {
    const headers = cors(request, env);
    // 瀏覽器可能先預檢跨來源請求；直接回 204 與 CORS 標頭，不執行資料操作。
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    try {
      let response;
      // 健康檢查只表示此路由可回應，不會驗證 D1 連線或 LINE 服務。
      if (request.method === "GET" && url.pathname === "/health") response = result({ ok: true });
      else if (request.method === "POST" && url.pathname === "/bookings") {
        // 新增預約：先驗證一般使用者身分，再讀取與檢查表單內容。
        const profile = await user(request, env);
        if (!profile)
          response = result({ error: "LINE 身分驗證失敗，請從 MINI App 重新開啟。" }, 401);
        else {
          const body = await request.json();
          // 限制各欄位型別與長度；身分資料取自 LINE profile，不由表單指定。
          const serviceId = trim(body.service, 30),
            bookingDate = trim(body.date, 10),
            timeSlot = trim(body.time, 30),
            customerName = trim(body.name, 60),
            customerPhone = trim(body.phone, 30),
            customerNote = trim(body.note, 500),
            service = services[serviceId];
          // 必須是已知服務、合法日期、該服務允許的時段，且姓名／電話不空白並已同意條款。
          if (
            !service ||
            !validRule(serviceId, bookingDate) ||
            !service.slots.includes(timeSlot) ||
            !customerName ||
            !customerPhone ||
            body.privacy !== "on"
          )
            response = result({ error: "預約資料不完整或不符合可預約規則。" }, 400);
          else {
            // 產生唯一預約 ID 與 UTC 時間戳；新申請一律從 pending（待確認）開始。
            const now = new Date().toISOString(),
              booking = {
                id: crypto.randomUUID(),
                line_user_id: profile.userId,
                customer_name: customerName,
                customer_phone: customerPhone,
                service_id: serviceId,
                service_name: service.name,
                booking_date: bookingDate,
                time_slot: timeSlot,
                customer_note: customerNote,
                status: "pending",
                admin_note: "",
                created_at: now,
                updated_at: now,
              };
            // D1 使用 ? 佔位符與 bind 分開傳值；bind 順序必須對應 INSERT 欄位順序。
            await env.DB.prepare(
              "INSERT INTO bookings (id,line_user_id,customer_name,customer_phone,service_id,service_name,booking_date,time_slot,customer_note,status,admin_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            )
              .bind(
                booking.id,
                booking.line_user_id,
                booking.customer_name,
                booking.customer_phone,
                booking.service_id,
                booking.service_name,
                booking.booking_date,
                booking.time_slot,
                booking.customer_note,
                booking.status,
                booking.admin_note,
                now,
                now,
              )
              .run();
            // 資料寫入成功後安排背景通知，不讓回應等待推播；通知失敗不會回滾預約。
            ctx.waitUntil(
              pushAdmins(
                env,
                [
                  "【新的預約申請】",
                  `${booking.service_name}｜${booking.booking_date}｜${slots[booking.time_slot]}`,
                  `姓名：${booking.customer_name}`,
                  `電話：${booking.customer_phone}`,
                  booking.customer_note ? `備註：${booking.customer_note}` : "",
                  "請至管理後台確認。",
                ]
                  .filter(Boolean)
                  .join("\n"),
              ).catch(console.error),
            );
            response = result({ booking: { id: booking.id, status: booking.status } }, 201);
          }
        }
      } else if (request.method === "GET" && url.pathname === "/bookings") {
        if (!(await user(request, env, true))) response = result({ error: "沒有管理權限。" }, 403);
        else {
          // 查詢預約：前面已要求管理員權限；預設只查 pending，可加選日期。
          const status = url.searchParams.get("status") || "pending",
            date = url.searchParams.get("date") || "";
          if (
            !["pending", "confirmed", "needs_information", "rejected", "all"].includes(status) ||
            (date && !validDate(date))
          )
            response = result({ error: "無效的篩選條件。" }, 400);
          else {
            // 只加入有使用的篩選條件；all 代表不限制狀態，值仍透過 bind 傳入。
            const where = [],
              params = [];
            if (status !== "all") {
              where.push("status=?");
              params.push(status);
            }
            if (date) {
              where.push("booking_date=?");
              params.push(date);
            }
            // 組合 WHERE 後，依預約日期與建立時間排序，將結果包成 bookings 陣列。
            const rows = await env.DB.prepare(
              `SELECT * FROM bookings ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY booking_date, created_at`,
            )
              .bind(...params)
              .all();
            response = result({ bookings: rows.results || [] });
          }
        }
      } else if (request.method === "PATCH" && /^\/bookings\/[\w-]+$/.test(url.pathname)) {
        if (!(await user(request, env, true))) response = result({ error: "沒有管理權限。" }, 403);
        else {
          // 更新預約：前面已要求管理員權限；從網址尾端取得 ID，主體提供狀態與備註。
          const body = await request.json(),
            status = trim(body.status, 30),
            adminNote = trim(body.admin_note, 500),
            id = url.pathname.split("/").at(-1);
          // 只允許明列的三種審核結果，不能藉此 API 改回 pending。
          if (!Object.hasOwn(statusLabels, status))
            response = result({ error: "無效的預約狀態。" }, 400);
          else {
            // 先確認預約存在，不存在則回 404；存在才更新狀態、備註與時間。
            const booking = await env.DB.prepare("SELECT * FROM bookings WHERE id=?")
              .bind(id)
              .first();
            if (!booking) response = result({ error: "找不到預約。" }, 404);
            else {
              const updated_at = new Date().toISOString();
              await env.DB.prepare(
                "UPDATE bookings SET status=?,admin_note=?,updated_at=? WHERE id=?",
              )
                .bind(status, adminNote, updated_at, id)
                .run();
              // 把舊資料與新狀態合併，供 API 回傳及背景推播共用；推播失敗只記錄錯誤。
              const updated = { ...booking, status, admin_note: adminNote, updated_at };
              ctx.waitUntil(
                push(env, updated.line_user_id, customerText(updated)).catch(console.error),
              );
              response = result({ booking: updated });
            }
          }
        }
      } else response = result({ error: "找不到 API 路徑。" }, 404);
      // 所有正常路由結果（含 4xx）都在此附加允許的 CORS 標頭。
      return respond(response, headers);
    } catch (error) {
      // 未預期的解析、網路或資料庫錯誤統一記錄，對前端回傳通用 500 訊息。
      console.error(error);
      return respond(result({ error: "系統暫時無法處理，請稍後再試。" }, 500), headers);
    }
  },
};
