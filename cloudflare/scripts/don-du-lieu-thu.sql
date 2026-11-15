-- Dọn dữ liệu do kiểm thử tự động tạo trên staging: CHỈ tài khoản email đuôi @vd.vn và các không gian chỉ có những tài khoản đó.
-- Tài khoản thật (người dùng tự đăng ký) không bị đụng tới.
-- Chạy: npx wrangler d1 execute phieu-ket-qua-staging --env staging --remote --file=scripts/don-du-lieu-thu.sql
DELETE FROM phieu WHERE kg IN (SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email LIKE '%@vd.vn' EXCEPT SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email NOT LIKE '%@vd.vn');
DELETE FROM lan_thi WHERE kg IN (SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email LIKE '%@vd.vn' EXCEPT SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email NOT LIKE '%@vd.vn');
DELETE FROM mau_phieu WHERE kg IN (SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email LIKE '%@vd.vn' EXCEPT SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email NOT LIKE '%@vd.vn');
DELETE FROM hoc_sinh_lop WHERE hoc_sinh IN (SELECT id FROM hoc_sinh WHERE kg IN (SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email LIKE '%@vd.vn' EXCEPT SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email NOT LIKE '%@vd.vn'));
DELETE FROM hoc_sinh WHERE kg IN (SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email LIKE '%@vd.vn' EXCEPT SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email NOT LIKE '%@vd.vn');
DELETE FROM lop WHERE kg IN (SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email LIKE '%@vd.vn' EXCEPT SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email NOT LIKE '%@vd.vn');
DELETE FROM khong_gian WHERE id IN (SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email LIKE '%@vd.vn' EXCEPT SELECT DISTINCT tv.kg FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan WHERE t.email NOT LIKE '%@vd.vn');
DELETE FROM phien WHERE tai_khoan IN (SELECT id FROM tai_khoan WHERE email LIKE '%@vd.vn');
DELETE FROM thanh_vien WHERE tai_khoan IN (SELECT id FROM tai_khoan WHERE email LIKE '%@vd.vn');
DELETE FROM tai_khoan WHERE email LIKE '%@vd.vn';
