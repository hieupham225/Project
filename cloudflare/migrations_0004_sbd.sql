-- v1.1: số báo danh (4–12 chữ số, thường 8) của học sinh (cố định cả khóa)
-- Chạy: npx wrangler d1 execute <db> [--env staging] --remote --file=migrations_0004_sbd.sql
ALTER TABLE hoc_sinh ADD COLUMN sbd TEXT NOT NULL DEFAULT '';
-- Lấy SBD (4–12 chữ số) đã có trên phiếu của từng em (phiếu mới nhất), chỉ khi SBD đó không dùng cho em khác
UPDATE hoc_sinh SET sbd = COALESCE((
  SELECT json_extract(p.du_lieu, '$.sbd') FROM phieu p
  WHERE p.hoc_sinh = hoc_sinh.id AND length(json_extract(p.du_lieu, '$.sbd')) BETWEEN 4 AND 12
    AND json_extract(p.du_lieu, '$.sbd') NOT GLOB '*[^0-9]*'
  ORDER BY p.ngay_tao DESC LIMIT 1), '')
WHERE sbd = '' AND EXISTS (SELECT 1 FROM phieu p WHERE p.hoc_sinh = hoc_sinh.id AND length(json_extract(p.du_lieu, '$.sbd')) BETWEEN 4 AND 12);
UPDATE hoc_sinh SET sbd = '' WHERE sbd IS NULL OR sbd IN (
  SELECT sbd FROM hoc_sinh h2 WHERE h2.sbd <> '' GROUP BY h2.kg, h2.sbd HAVING COUNT(*) > 1);
CREATE UNIQUE INDEX IF NOT EXISTS ix_hs_sbd ON hoc_sinh(kg, sbd) WHERE sbd <> '';
