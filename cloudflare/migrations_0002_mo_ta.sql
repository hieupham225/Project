-- Thêm mô tả cho lần thi (chạy 1 lần trên cơ sở dữ liệu đã có), điền từ phiếu đã tạo
ALTER TABLE lan_thi ADD COLUMN mo_ta TEXT NOT NULL DEFAULT '';
UPDATE lan_thi SET mo_ta = COALESCE((SELECT json_extract(p.du_lieu, '$.moTa') FROM phieu p WHERE p.lan_thi = lan_thi.id LIMIT 1), '');
