-- v1.1: mẫu phiếu tạo từ file Word
-- Chạy: npx wrangler d1 execute <db> [--env staging] --remote --file=migrations_0005_mau_phieu.sql
CREATE TABLE IF NOT EXISTS mau_phieu (
  id         TEXT PRIMARY KEY,
  kg         TEXT NOT NULL REFERENCES khong_gian(id) ON DELETE CASCADE,
  ten        TEXT NOT NULL,
  html       TEXT NOT NULL,
  truong     TEXT NOT NULL DEFAULT '[]',
  trang      TEXT NOT NULL DEFAULT '{}',
  ten_tep    TEXT NOT NULL DEFAULT '',
  ngay_tao   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mp_kg ON mau_phieu(kg);
ALTER TABLE lan_thi ADD COLUMN mau_phieu TEXT NOT NULL DEFAULT '';
