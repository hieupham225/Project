-- Cơ sở dữ liệu D1 cho hệ thống phiếu kết quả học tập.
-- Mỗi "không gian" (kg) là của 1 trung tâm hoặc 1 giáo viên tự đăng ký; dữ liệu các không gian tách biệt hoàn toàn.
-- Chạy:  npx wrangler d1 execute phieu-ket-qua --local --file=schema.sql   (hoặc --remote khi đưa lên thật)

CREATE TABLE IF NOT EXISTS khong_gian (
  id         TEXT PRIMARY KEY,
  ten        TEXT NOT NULL,                 -- tên trung tâm / lớp học, in trên phiếu
  cai_dat    TEXT NOT NULL DEFAULT '{}',    -- JSON: khẩu hiệu, logo (data URL nhỏ)...
  ngay_tao   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tai_khoan (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,          -- luôn chữ thường
  ho_ten     TEXT NOT NULL,
  mat_khau   TEXT NOT NULL,                 -- PBKDF2-SHA256, dạng "lặp$muối$băm"
  ngay_tao   TEXT NOT NULL
);

-- Ai thuộc không gian nào, vai trò gì, phụ trách lớp nào
CREATE TABLE IF NOT EXISTS thanh_vien (
  kg         TEXT NOT NULL REFERENCES khong_gian(id) ON DELETE CASCADE,
  tai_khoan  TEXT NOT NULL REFERENCES tai_khoan(id) ON DELETE CASCADE,
  vai_tro    TEXT NOT NULL,                 -- 'chu' | 'quan_tri' | 'giao_vien'
  lop        TEXT NOT NULL DEFAULT '[]',    -- JSON mảng id lớp, hoặc '*' = tất cả lớp
  trang_thai TEXT NOT NULL DEFAULT 'Hoạt động',
  ngay_tao   TEXT NOT NULL,
  PRIMARY KEY (kg, tai_khoan)
);

CREATE TABLE IF NOT EXISTS phien (
  bam_token  TEXT PRIMARY KEY,              -- SHA-256 của token trong cookie (không lưu token gốc)
  tai_khoan  TEXT NOT NULL REFERENCES tai_khoan(id) ON DELETE CASCADE,
  kg         TEXT NOT NULL,
  het_han    INTEGER NOT NULL               -- epoch ms
);

CREATE TABLE IF NOT EXISTS lop (
  id         TEXT PRIMARY KEY,
  kg         TEXT NOT NULL REFERENCES khong_gian(id) ON DELETE CASCADE,
  ten        TEXT NOT NULL,
  khoa       TEXT NOT NULL,                 -- tên bỏ dấu, chữ thường, để chống trùng
  mon        TEXT NOT NULL DEFAULT '',      -- môn học (gợi ý cấu trúc đề khi gửi kết quả)
  ngay_tao   TEXT NOT NULL,
  UNIQUE (kg, khoa)
);

CREATE TABLE IF NOT EXISTS hoc_sinh (
  id         TEXT PRIMARY KEY,
  kg         TEXT NOT NULL REFERENCES khong_gian(id) ON DELETE CASCADE,
  ma_hs      TEXT NOT NULL,
  ho_ten     TEXT NOT NULL,
  ngay_sinh  TEXT NOT NULL DEFAULT '',
  sdt        TEXT NOT NULL DEFAULT '',
  ghi_chu    TEXT NOT NULL DEFAULT '',
  ma_tra_cuu TEXT NOT NULL UNIQUE,          -- 8 ký tự ngẫu nhiên, duy nhất trên toàn hệ thống
  sbd        TEXT NOT NULL DEFAULT '',      -- số báo danh 8 số, cố định cả khóa (duy nhất trong không gian)
  ngay_tao   TEXT NOT NULL,
  UNIQUE (kg, ma_hs)
);

CREATE TABLE IF NOT EXISTS hoc_sinh_lop (
  hoc_sinh   TEXT NOT NULL REFERENCES hoc_sinh(id) ON DELETE CASCADE,
  lop        TEXT NOT NULL REFERENCES lop(id) ON DELETE CASCADE,
  thu_tu     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hoc_sinh, lop)
);

-- 1 dòng = 1 lần làm của 1 bài thi trong 1 lớp
CREATE TABLE IF NOT EXISTS lan_thi (
  id         TEXT PRIMARY KEY,
  kg         TEXT NOT NULL REFERENCES khong_gian(id) ON DELETE CASCADE,
  lop        TEXT NOT NULL REFERENCES lop(id) ON DELETE CASCADE,
  bai_thi    TEXT NOT NULL,
  lan        INTEGER NOT NULL,
  ngay_thi   TEXT NOT NULL DEFAULT '',      -- dd/MM/yyyy
  mo_ta      TEXT NOT NULL DEFAULT '',      -- dòng mô tả dưới tiêu đề phiếu
  thu_tu     INTEGER NOT NULL DEFAULT 0,    -- yyyyMMdd để sắp xếp
  cong_bo    INTEGER NOT NULL DEFAULT 0,
  cau_truc   TEXT NOT NULL DEFAULT '',      -- id cấu trúc đề (trống = Toán v1)
  mau_phieu  TEXT NOT NULL DEFAULT '',      -- id mẫu phiếu Word (trống = mẫu mặc định "Phân tích bài thi")
  ngay_tao   TEXT NOT NULL
);

-- Phiếu: lưu dữ liệu đã chấm (JSON); phiếu được dựng thành trang/PDF ngay trên trình duyệt
CREATE TABLE IF NOT EXISTS phieu (
  id         TEXT PRIMARY KEY,
  kg         TEXT NOT NULL,
  lan_thi    TEXT NOT NULL REFERENCES lan_thi(id) ON DELETE CASCADE,
  hoc_sinh   TEXT NOT NULL REFERENCES hoc_sinh(id) ON DELETE CASCADE,
  tong_diem  TEXT NOT NULL,
  diem_toi_da TEXT NOT NULL,
  du_lieu    TEXT NOT NULL,
  ngay_tao   TEXT NOT NULL,
  UNIQUE (lan_thi, hoc_sinh)
);

-- Mẫu phiếu tạo từ file Word (trộn thư / Word thường): HTML giữ bố cục, trường «Tên» chờ điền
CREATE TABLE IF NOT EXISTS mau_phieu (
  id         TEXT PRIMARY KEY,
  kg         TEXT NOT NULL REFERENCES khong_gian(id) ON DELETE CASCADE,
  ten        TEXT NOT NULL,
  html       TEXT NOT NULL,
  truong     TEXT NOT NULL DEFAULT '[]',    -- JSON: tên các trường trong mẫu
  trang      TEXT NOT NULL DEFAULT '{}',    -- JSON: khổ giấy, lề (pt)
  ten_tep    TEXT NOT NULL DEFAULT '',
  ngay_tao   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mp_kg ON mau_phieu(kg);

-- Đếm số lần thử (đăng nhập, tra cứu mã) để chống dò
CREATE TABLE IF NOT EXISTS gioi_han (
  khoa       TEXT PRIMARY KEY,              -- vd 'dn:1.2.3.4:28812345' (loại:ip:phút)
  dem        INTEGER NOT NULL,
  het_han    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_tv_tk ON thanh_vien(tai_khoan);
CREATE INDEX IF NOT EXISTS ix_lop_kg ON lop(kg);
CREATE INDEX IF NOT EXISTS ix_hs_kg ON hoc_sinh(kg);
CREATE UNIQUE INDEX IF NOT EXISTS ix_hs_sbd ON hoc_sinh(kg, sbd) WHERE sbd <> '';
CREATE INDEX IF NOT EXISTS ix_hsl_lop ON hoc_sinh_lop(lop);
CREATE INDEX IF NOT EXISTS ix_lt_kg ON lan_thi(kg, lop);
CREATE INDEX IF NOT EXISTS ix_phieu_hs ON phieu(hoc_sinh);
CREATE INDEX IF NOT EXISTS ix_phieu_kg ON phieu(kg, lan_thi);
CREATE INDEX IF NOT EXISTS ix_phien_tk ON phien(tai_khoan);
