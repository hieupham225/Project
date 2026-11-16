# EduLens — phiếu kết quả học tập, mỗi phụ huynh chỉ xem được điểm của con mình

Giáo viên (dạy riêng hoặc trung tâm) **tự đăng ký tài khoản**, tạo lớp, rồi tải lên **2 file**:
**bảng kết quả học sinh** và **bảng đáp án theo mã đề**. Hệ thống tự ghép từng học sinh với đáp án của đúng mã đề em đó làm, chấm, và tạo **phiếu "Phân tích bài thi"** cho từng em.
Phụ huynh nhập **1 mã tra cứu riêng** để xem tất cả phiếu của con, ở mọi lớp và môn, và tải về dạng PDF.

- **Không ai phải cài đặt gì.** Giáo viên và phụ huynh chỉ cần mở trang web trên máy tính hoặc điện thoại.
- **Miễn phí:** chạy trên gói miễn phí của Cloudflare (Workers + D1).
- **Dữ liệu tách biệt:** mỗi giáo viên hoặc trung tâm có một không gian riêng. Trong một trung tâm, mỗi giáo viên chỉ thấy các lớp mình phụ trách.

**Đang chạy tại:** https://phieu-ket-qua.ketquahoctap.workers.dev (phụ huynh) · https://phieu-ket-qua.ketquahoctap.workers.dev/gv (giáo viên)

| Trang | Ai dùng | Làm gì |
|---|---|---|
| `/` | Phụ huynh | Nhập mã tra cứu, xem phiếu, tải PDF |
| `/gv` | Giáo viên | Đăng ký / đăng nhập, quản lý lớp học và học sinh, gửi kết quả, công bố, xem tổng hợp, mời giáo viên khác |

```
Giáo viên                                                              Phụ huynh
  Đăng ký ──► Tạo lớp ──► Thêm học sinh (mỗi em 1 Mã HS + 1 mã tra cứu) ──(nhắn riêng 1 lần)──► nhận mã
  Gửi kết quả: ① bảng kết quả (cột Lớp) + ② bảng đáp án theo mã đề ──► tự ghép lớp + học sinh, chấm
               ──► Lần 1, Lần 2… ──► Công bố ──────────────────────────────────────────────► nhập mã → xem / tải PDF
```

---

## Hai file giáo viên tải lên

Đáp án đúng chỉ khai báo **một lần cho mỗi mã đề**, không phải chép vào từng dòng học sinh như khi trộn thư Word.
Bấm **⬇ Mẫu bảng kết quả của lớp** và **⬇ Mẫu bảng đáp án theo mã đề** trong trang giáo viên để có file mẫu.

### ① Bảng kết quả học sinh (mỗi học sinh 1 dòng)
| Cột | Ghi chú |
|---|---|
| `Mã HS` | Đã điền sẵn trong file mẫu của lớp. **Không sửa.** Dùng để nhận đúng học sinh. |
| `Họ và tên` | Bắt buộc. |
| `Lớp` | Hệ thống tự đưa từng dòng vào đúng lớp, **một file có thể gồm nhiều lớp**. Lớp chưa có sẽ được tạo mới. Để trống: lấy lớp của học sinh (theo Mã HS / họ tên) nếu em chỉ học 1 lớp, không thì hệ thống hỏi. |
| `Số báo danh`, `Mã đề thi`, `STT`, `Thứ hạng` | Mã đề dùng để lấy đúng đáp án. Số báo danh và thứ hạng được in lên phiếu. |
| `Câu 1` … `Câu N` | Đáp án học sinh chọn. Trắc nghiệm: `A`–`D`. Đúng/sai: `Đ,S,Đ,S` (ý bỏ trống để trống giữa hai dấu phẩy). Điền từ: có thể để trống. |
| `Điểm trắc nghiệm`, `Điểm đúng sai`, `Điểm điền từ`, `Tổng điểm` | Để trống thì hệ thống tự tính. Nếu điểm nhập khác điểm tính từ đáp án, hệ thống cảnh báo. |
| `Ưu điểm`, `Nhược điểm` (hoặc 1 cột `Ưu, nhược`), `Hướng khắc phục`, `Lời khuyên` | In lên phiếu. |

Có thể tải lên nguyên **bảng tổng hợp điểm đang dùng để trộn thư Word**: các cột đáp án đúng ở cuối dòng sẽ được bỏ qua.
Nếu chưa có file đáp án, hệ thống tạm dùng chính các cột đáp án đúng đó.

### ② Bảng đáp án theo mã đề
| Tab | Nội dung |
|---|---|
| `DapAn` | Mỗi mã đề 1 dòng: `Mã đề` · `Câu 1` … `Câu N` (đáp án đúng). |
| `CauHoi` *(tùy chọn)* | `Câu` · `Phần` (I/II/III) · `Chủ đề kiến thức` · `Mức độ` · `Nội dung phân tích cụ thể`. Có thể thêm cột `Mã đề` nếu các mã đề đảo thứ tự câu. |
| `ThongTin` *(tùy chọn)* | Tiêu đề phiếu, mô tả, ngày thi, tên và mô tả từng phần. |

Nếu bỏ trống cột `Phần`, hệ thống tự nhận theo đáp án: A–D là trắc nghiệm, 4 ý Đ/S là đúng/sai, còn lại là điền từ / tự luận.

**Thang điểm tự tính** (theo cấu trúc đề 2025): trắc nghiệm 0,25 đ/câu. Đúng/sai tính theo số ý đúng trong câu: 1 ý 0,1 đ, 2 ý 0,25 đ, 3 ý 0,5 đ, 4 ý 1 đ. Điền từ 0,5 đ/câu.
Thử với bảng điểm thật của 117 học sinh: điểm tự tính khớp **117/117** với điểm giáo viên đã chấm.

---

## Cách dùng

### Giáo viên
1. Mở `/gv` → **Đăng ký miễn phí**: nhập họ tên, tên hiển thị trên phiếu (trung tâm / lớp học), email và mật khẩu.
2. **Lớp học** → **+ Lớp mới** → mở lớp → **+ Học sinh mới / nhập Excel**: dán danh sách họ tên. Mỗi em được cấp **Mã HS** và **mã tra cứu**.
   Trong trang lớp: xem sĩ số và các bài thi của lớp, **+ Thêm học sinh đã có** (em học thêm lớp/môn khác, vẫn 1 mã tra cứu), bỏ em khỏi lớp, đổi tên hoặc xóa lớp.
   Tab **Học sinh** quản lý thông tin từng em (sửa, cấp lại mã, xóa) trên toàn bộ các lớp. Học sinh **không bắt buộc** thuộc lớp nào (lọc "Chưa có lớp").
   Xóa lớp không xóa học sinh hay mã tra cứu; chỉ xóa các lần thi và phiếu điểm **của lớp đó**.
3. **Tin nhắn gửi mã (cả lớp)**: sao chép và nhắn **riêng** cho từng phụ huynh. Mỗi phụ huynh chỉ cần nhận mã một lần.
4. **Bài thi** → **📤 Gửi kết quả thi** (trang con của thẻ Bài thi):
   1. Tải file mẫu (mặc định gồm học sinh của tất cả lớp, mỗi dòng ghi sẵn lớp; có thể lọc 1 lớp). Xóa dòng của em không làm bài.
   2. Tải lên 2 file.
   3. Kiểm tra bảng ghép: tóm tắt theo từng lớp, mỗi dòng có lớp và học sinh được ghép. Dòng "cần chọn" (chưa rõ lớp, gõ sai tên, Mã HS lạ, tên không khớp Mã HS) thì chọn lớp / đúng em.
   4. Đặt tên bài thi và bấm **Tạo phiếu**: mỗi lớp trong file được 1 lần thi. Lớp đã làm bài này thì thành **Lần 2, Lần 3…** (tính riêng từng lớp).
   5. Popup báo thành công: bấm **Xem phiếu** để kiểm tra, rồi **📢 Công bố**; **Xong** để về danh sách Bài thi.
5. **Bài thi**: danh sách các lần thi theo lớp; Xem phiếu, Công bố / Ngừng công bố, Sửa tiêu đề (mọi lần của bài trong lớp), mô tả và ngày thi, xóa từng lần. **Tổng hợp**: bảng điểm cả lớp qua các bài và các lần, kèm trung bình và tiến bộ.
6. **Giáo viên** (chủ / quản trị): mời giáo viên khác bằng email và giao lớp phụ trách.
7. **Cài đặt**: tên trung tâm, khẩu hiệu, logo in trên phiếu.

Một học sinh có thể học nhiều lớp/môn mà vẫn chỉ có **một** mã tra cứu.
Khi trùng tên với học sinh ở lớp khác, hệ thống **hỏi** "cùng một em hay học sinh khác" chứ không tự đoán. Lý do: ghép nhầm hai em sẽ làm lộ điểm của em này cho phụ huynh em kia.

### Phụ huynh
Mở trang `/` → nhập mã tra cứu → xem phiếu theo từng lớp/môn, kèm biểu đồ tiến bộ → bấm **Tải PDF** (file khổ A4, tạo ngay trên điện thoại).

---

## Bảo mật
- Mã tra cứu ngẫu nhiên 8 ký tự (khoảng 850 tỷ khả năng), không dựa trên tên hay ngày sinh. Nhập sai nhiều lần bị tạm khóa.
- Mỗi mã chỉ mở được phiếu của đúng học sinh đó, và chỉ những lần thi **đã công bố**.
- Mật khẩu mã hóa bằng PBKDF2-SHA256 có muối riêng. Phiên đăng nhập dùng cookie `HttpOnly`, máy chủ chỉ lưu mã băm của phiên. Đăng nhập sai nhiều lần bị tạm khóa.
- Mọi thao tác của giáo viên đều được máy chủ kiểm tra **không gian** và **lớp phụ trách**. Có kiểm thử riêng cho việc dữ liệu giữa các không gian tách biệt.
- Chống CSRF: API chỉ nhận yêu cầu có header riêng, trang web khác không tự gửi được.
- Dữ liệu cá nhân của học sinh: nên có **sự đồng ý của phụ huynh** cho việc xử lý dữ liệu (Nghị định 13/2023), ví dụ một dòng trong phiếu đăng ký học.

---

## Đưa lên Cloudflare (miễn phí)

Cần một tài khoản Cloudflare (đăng ký bằng email, miễn phí) và Node.js 20 trở lên.

```bash
cd cloudflare
npm install
npx wrangler login                                   # mở trình duyệt để đăng nhập Cloudflare
npx wrangler d1 create phieu-ket-qua                 # chép "database_id" in ra vào wrangler.toml
npx wrangler d1 execute phieu-ket-qua --remote --file=schema.sql
npx wrangler deploy                                  # in ra link dạng https://phieu-ket-qua.<tên>.workers.dev
# Cơ sở dữ liệu tạo từ bản cũ (trước khi có "Mô tả" của lần thi): chạy 1 lần
# npx wrangler d1 execute phieu-ket-qua --remote --file=migrations_0002_mo_ta.sql
```

Có thể gắn tên miền riêng trong Cloudflare: **Workers → phieu-ket-qua → Settings → Domains & Routes**.

**Chạy thử trên máy:**
```bash
cd cloudflare && npm install
npx wrangler d1 execute phieu-ket-qua --local --file=schema.sql
npx wrangler dev                                     # http://127.0.0.1:8787  (giáo viên: /gv)
GOC=http://127.0.0.1:8787 npm test                   # kiểm thử API (cửa sổ khác)
```

**Gói miễn phí của Cloudflare** (đủ cho một trung tâm): 100.000 lượt gọi/ngày, D1 5 GB, 5 triệu dòng đọc và 100.000 dòng ghi/ngày.
Vượt hạn mức thì Cloudflare tạm chặn, không tự tính tiền. Phiếu không lưu dạng PDF: máy chủ chỉ lưu dữ liệu đã chấm, và trình duyệt dựng phiếu hoặc PDF.

## Cấu trúc thư mục
```
cloudflare/                 Phiên bản chính
  src/index.js              Máy chủ (Worker): đăng ký/đăng nhập, phân quyền, gửi kết quả, tra cứu
  src/logic.js              Đọc 2 file, chấm bài, ghép học sinh theo lớp (logic thuần, dùng lại từ bản trước)
  public/index.html         Trang tra cứu cho phụ huynh
  public/gv.html            Trang giáo viên
  public/phieu.js           Dựng phiếu "Phân tích bài thi" (dùng chung)
  schema.sql                Cấu trúc cơ sở dữ liệu D1
  test/api.test.mjs         Kiểm thử API đầu-cuối
apps-script/                Phiên bản cũ (Google Apps Script), không còn phát triển
```
