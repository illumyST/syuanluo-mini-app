-- D1／SQLite 預約資料表；IF NOT EXISTS 讓首次建表指令可重複執行，但不會修改既有表結構。
CREATE TABLE IF NOT EXISTS bookings (
-- Worker 產生 UUID 作主鍵；LINE userId 由驗證後的 profile 取得，供後續通知使用。
  id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL,
-- 聯絡資訊以文字保存，電話也用 TEXT 保留前導零與符號。
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
-- CHECK 限制服務代碼；另存當次服務名稱，查詢與通知時可直接顯示。
  service_id TEXT NOT NULL CHECK (service_id IN ('transfer', 'numerology')),
  service_name TEXT NOT NULL,
-- 日期存 YYYY-MM-DD，時段存英文代碼；實際時間仍由後續聯繫確認。
  booking_date TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  customer_note TEXT NOT NULL DEFAULT '',
-- 新預約預設 pending；CHECK 防止寫入四種已知狀態以外的值。
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'needs_information', 'rejected')),
-- 管理者回覆與顧客備註分開保存；時間戳由 Worker 以 UTC ISO 字串寫入。
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 依狀態、預約日期建立複合索引，支援後台常用的狀態及日期篩選。
CREATE INDEX IF NOT EXISTS bookings_status_date_idx ON bookings(status, booking_date);
