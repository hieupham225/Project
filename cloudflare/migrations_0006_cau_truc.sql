-- v1.1: cấu trúc đề do quản trị tự tạo (nhân bản từ cấu trúc có sẵn rồi sửa)
-- Chạy: npx wrangler d1 execute <db> [--env staging] --remote --file=migrations_0006_cau_truc.sql
CREATE TABLE IF NOT EXISTS cau_truc (
  id         TEXT PRIMARY KEY,
  kg         TEXT NOT NULL REFERENCES khong_gian(id) ON DELETE CASCADE,
  mon        TEXT NOT NULL DEFAULT '',
  ten        TEXT NOT NULL,
  du_lieu    TEXT NOT NULL,                -- JSON: { phan: [{ ma, ten, dang, soCau, diemMoiCau, phuongAn, soY, bangDiem }] }
  ngay_tao   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ct_kg ON cau_truc(kg);
