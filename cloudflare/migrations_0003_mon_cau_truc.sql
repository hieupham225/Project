-- v2: môn học của lớp + cấu trúc đề của lần thi
-- Chạy: npx wrangler d1 execute <db> [--env staging] --remote --file=migrations_0003_mon_cau_truc.sql
ALTER TABLE lop ADD COLUMN mon TEXT NOT NULL DEFAULT '';
ALTER TABLE lan_thi ADD COLUMN cau_truc TEXT NOT NULL DEFAULT '';
-- dữ liệu v1 đều là môn Toán
UPDATE lop SET mon = 'Toán' WHERE mon = '';
UPDATE lan_thi SET cau_truc = 'thpt2025-toan' WHERE cau_truc = '';
