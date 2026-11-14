# Phiếu kết quả kiểm tra riêng cho từng phụ huynh

Sau khi chấm bài, giáo viên có **file kết quả (Excel hoặc Google Sheet)** và **mẫu phiếu** như mẫu đang dùng với chức năng trộn thư của Word.
Công cụ này tự sinh **một phiếu PDF riêng cho từng học sinh**. Phụ huynh mở **một link chung**, nhập **mã tra cứu riêng**
và **chỉ xem được phiếu của con mình**. Phụ huynh em A không xem được phiếu của em B, và ngược lại.

```
File kết quả (Excel / Google Sheet) ─┐
                                     ├─► Tạo phiếu ─► 1 file PDF / học sinh (Drive riêng tư của giáo viên)
Mẫu phiếu (Google Docs, có ô trộn) ──┘                         │
                                                               ▼
                       Phụ huynh nhập mã riêng ─► chỉ thấy phiếu của con mình
```

| Danh sách phiếu | Xem phiếu trên điện thoại |
|---|---|
| ![Danh sách phiếu](docs/man-hinh-danh-sach.png) | ![Xem phiếu](docs/man-hinh-phieu.png) |

- Miễn phí, chỉ cần một tài khoản Google.
- Link chung có thể gửi vào nhóm Zalo vì link không chứa thông tin của ai.
- Mỗi phụ huynh chỉ nhận mã **một lần**, dùng cho cả năm học. Các đợt kiểm tra sau chỉ cần tạo phiếu và tích "Công bố".

---

## A. Cài đặt (làm một lần, khoảng 15 phút)

### A1. Tạo file Sheet quản lý và dán mã
1. Vào https://sheets.new để tạo một Google Sheet mới, ví dụ đặt tên "Quản lý kết quả lớp Toán 2". **Không chia sẻ file này cho ai.**
2. Chọn **Tiện ích mở rộng → Apps Script**.
3. Trong file `Code.gs`: xóa hết nội dung có sẵn, rồi dán toàn bộ nội dung file [`apps-script/Code.gs`](apps-script/Code.gs).
4. Bấm **+** cạnh "Tệp" → **HTML**, đặt tên là `Index` (không gõ đuôi `.html`), rồi dán nội dung file [`apps-script/Index.html`](apps-script/Index.html).
5. Bấm 💾 **Lưu**.
6. Quay lại Sheet và tải lại trang (F5). Trên thanh menu sẽ có mục **📋 Tra cứu điểm**.
7. Chọn **📋 Tra cứu điểm → 1. Cài đặt ban đầu**. Hệ thống tạo các tab `HocSinh`, `DotKiemTra`, `PhieuKetQua`.
   - Lần đầu, Google sẽ hỏi quyền. Bấm **Tiếp tục**, chọn tài khoản của bạn.
   - Nếu thấy cảnh báo "Google chưa xác minh ứng dụng này", bấm **Nâng cao → Đi tới … (không an toàn)** → **Cho phép**.
     Cảnh báo này là bình thường vì đây là mã do chính bạn tạo.

### A2. Xuất bản trang tra cứu
1. Trong cửa sổ Apps Script, bấm **Triển khai → Tùy chọn triển khai mới** → ⚙️ → **Ứng dụng web**.
2. Thiết lập:
   - **Thực thi với tư cách: Tôi**
   - **Người có quyền truy cập: Bất kỳ ai**
3. Bấm **Triển khai** và sao chép link `https://script.google.com/macros/s/…/exec`.
4. Trên Sheet, chọn **📋 Tra cứu điểm → 6. Lưu link trang tra cứu**, rồi dán link vừa sao chép.

> Tài khoản Google do trường cấp (Workspace) có thể không có lựa chọn "Bất kỳ ai".
> Khi đó hãy dùng Gmail cá nhân, hoặc nhờ quản trị viên của trường bật quyền này.

### A3. Chuẩn bị mẫu phiếu (Google Docs)
Mẫu phiếu là **một file Google Docs** có bố cục giống phiếu hiện tại: logo, bảng, màu chữ…
Ở những chỗ cần điền dữ liệu, viết **ô trộn**. Tên trong ô trộn là **tên cột** trong file kết quả:

| Cách viết | Ví dụ |
|---|---|
| `{{Tên cột}}` | `{{Họ và tên}}`, `{{Tổng điểm}}`, `{{Câu1_HS}}` |
| `«Tên_cột»` (kiểu Word) | `«Họ_và_tên»`, `«Tong_diem»` |

- Hệ thống không phân biệt chữ hoa/thường, và coi dấu `_` như dấu cách.
- Định dạng của ô trộn được giữ nguyên. Ví dụ ô `{{Câu1_HS}}` tô **đỏ** thì đáp án của học sinh hiện màu đỏ, giống phiếu đang dùng.

**Cách nhanh nhất nếu đã có mẫu Word trộn thư:**
1. Tải file Word mẫu lên Google Drive, mở bằng **Google Docs**, rồi chọn **Tệp → Lưu dưới dạng Google Tài liệu**.
2. Kiểm tra các ô trộn. Nếu chúng hiện dạng `«Tên_trường»` thì có thể dùng luôn. Nếu bị mất, gõ lại theo dạng `{{Tên cột}}`.

Chưa có mẫu? Mở tab kết quả, rồi chọn **📋 Tra cứu điểm → Tạo mẫu phiếu ví dụ**. Hệ thống tạo một mẫu Google Docs
có sẵn mọi cột, và bạn chỉ cần trang trí lại.

> Nội dung giống nhau cho mọi học sinh (chủ đề từng câu, nội dung phân tích…) cứ viết thẳng vào mẫu.
> Chỉ những chỗ khác nhau giữa các học sinh mới cần ô trộn.

---

## B. Mỗi đợt kiểm tra

### B1. Đưa file kết quả vào Sheet
- **File Excel:** chọn **Tệp → Nhập → Tải lên**, chọn file Excel, rồi chọn **"Chèn trang tính mới"**. Đổi tên tab mới, ví dụ `KQ Thang 9`.
- **Link Google Sheet:** chọn **📋 Tra cứu điểm → 2. Nhập kết quả từ link Google Sheet**.

Yêu cầu với file kết quả: mỗi học sinh **một dòng**, và có cột **`Họ và tên`** (hoặc `Họ tên`) hoặc cột **`Mã HS`**.
Các dòng tiêu đề lớn phía trên bảng không gây lỗi, vì hệ thống tự tìm dòng tiêu đề.

### B2. Lần đầu: tạo danh sách học sinh và mã tra cứu
1. Mở tab kết quả, rồi chọn **3. Thêm học sinh từ tab kết quả đang mở**. Tab `HocSinh` sẽ được điền tự động.
2. Chọn **4. Tạo mã tra cứu cho học sinh chưa có mã**.
3. Chọn **7. Tạo tin nhắn gửi mã cho phụ huynh**. Tab `TinNhan` có sẵn tin nhắn cho từng em.
   Sao chép từng tin và **nhắn riêng (1-1)** qua Zalo cho đúng phụ huynh.

Các đợt sau không cần làm lại bước này. Chỉ khi có học sinh mới thì chạy lại bước 1 và 2: các mã cũ được giữ nguyên.

### B3. Khai báo đợt và tạo phiếu
1. Mở tab `DotKiemTra` và thêm một dòng:

   | Tên đợt | Tab kết quả | Link mẫu phiếu | Công bố |
   |---|---|---|---|
   | Tháng 9/2026 | KQ Thang 9 | https://docs.google.com/document/d/… | ☐ |

2. Chọn một ô trên dòng đó, rồi chọn **📋 Tra cứu điểm → 5. Tạo phiếu PDF cho đợt đang chọn**.
   - Mỗi học sinh được tạo **một file PDF**, lưu trong thư mục *"Phiếu kết quả - Tháng 9/2026"* trên Drive của bạn (không chia sẻ).
   - Nếu lớp đông và gặp báo *"hết thời gian"*: chạy lại chức năng này, hệ thống sẽ tạo tiếp những phiếu còn thiếu.
   - Nếu có ô trộn không khớp tên cột, hệ thống báo trước khi tạo.
3. **Mở thư mục và kiểm tra vài phiếu.** Khi thấy đúng, tích ô **Công bố**. Từ lúc đó phụ huynh mới xem được.

**Sửa sai sau khi đã tạo phiếu:** sửa dữ liệu hoặc mẫu, chọn dòng của đợt, chọn **Xóa phiếu của đợt đang chọn**, rồi tạo lại.

---

## C. Phụ huynh xem phiếu như thế nào?
1. Mở link trang tra cứu (link chung của lớp).
2. Nhập mã tra cứu đã nhận riêng, ví dụ `K7X9-2QMP`.
3. Trang hiện danh sách phiếu các đợt **đã công bố** của con. Bấm vào một phiếu để xem ngay trên điện thoại, hoặc bấm **Tải PDF**.

---

## Tình huống thường gặp
- **Phụ huynh làm lộ mã hoặc quên mã:** mở tab `HocSinh`, chọn dòng của em đó, rồi chọn **Cấp lại mã cho học sinh đang chọn**. Mã cũ hết hiệu lực ngay.
- **Hai học sinh trùng họ tên:** thêm cột `Mã HS` vào file kết quả (lấy theo tab `HocSinh`) để phân biệt.
- **Một dòng bị bỏ qua khi tạo phiếu:** thông báo sẽ ghi lý do, thường là học sinh chưa có trong tab `HocSinh`.
- **Sau khi sửa mã Apps Script:** vào **Triển khai → Quản lý các lượt triển khai → ✏️ → Phiên bản mới → Triển khai**. Làm như vậy thì link giữ nguyên.
- **Muốn hiện điểm dạng bảng đơn giản thay cho phiếu PDF:** tạo tab có tên bắt đầu bằng `Điểm` và có cột `Mã HS`.
  Phụ huynh sẽ thấy bảng điểm này bên dưới danh sách phiếu. Cột có tiêu đề bắt đầu bằng `#` sẽ bị ẩn.

## Vì sao an toàn?
- **File Sheet, mẫu phiếu và các file PDF đều riêng tư** trong Drive của giáo viên. Không có file nào được chia sẻ.
- Trang tra cứu **kiểm tra mã ở mỗi lần xem**. Mỗi mã chỉ mở được phiếu của đúng học sinh đó, và chỉ những đợt đã tích "Công bố".
- **Mã tra cứu ngẫu nhiên** gồm 8 ký tự (khoảng 850 tỷ khả năng), không dựa trên tên hay ngày sinh, nên không thể đoán.
- **Chống dò mã:** mỗi lần nhập sai bị chậm 1 giây. Nếu cả hệ thống có quá 30 lần nhập sai trong một phút, trang tra cứu tạm khóa.
- Các chức năng của giáo viên (tạo phiếu, tạo mã…) chỉ chạy được từ trong Sheet, không gọi được từ trang tra cứu.

## Cấu trúc thư mục
```
apps-script/
  Code.gs           Xử lý: trộn phiếu → PDF, tra cứu, tạo mã, menu cho giáo viên
  Index.html        Trang tra cứu cho phụ huynh (xem PDF ngay trên điện thoại)
  appsscript.json   Cấu hình (múi giờ VN, quyền web app); chỉ cần khi dùng công cụ clasp
docs/               Ảnh minh họa
```
Có thể đổi tiêu đề trang, độ dài mã và giới hạn số lần nhập sai trong biến `CAU_HINH` ở đầu file `Code.gs`.
