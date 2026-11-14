# Tra cứu điểm riêng cho từng phụ huynh

Giáo viên nhập điểm trên **Google Sheet**. Mỗi học sinh có một **mã tra cứu ngẫu nhiên** được gửi riêng cho phụ huynh.
Phụ huynh mở **một link chung**, nhập mã và **chỉ thấy điểm của con mình**.

- Miễn phí, chỉ cần một tài khoản Google.
- Link chung có thể gửi vào nhóm Zalo vì link không chứa điểm của ai.
- Giáo viên chỉ cần cập nhật Sheet, phụ huynh thấy điểm mới ngay.
- Dùng được cho nhiều lớp và nhiều đợt kiểm tra trong cùng một file.

---

## Cài đặt (khoảng 10 phút, chỉ làm một lần)

### Bước 1: Tạo file Sheet và dán mã
1. Vào https://sheets.new để tạo một Google Sheet mới, đặt tên, ví dụ "Điểm lớp 6A". **Không chia sẻ file này cho ai.**
2. Chọn menu **Tiện ích mở rộng (Extensions) → Apps Script**.
3. Trong file `Code.gs`: xóa hết nội dung có sẵn, rồi dán toàn bộ nội dung file [`apps-script/Code.gs`](apps-script/Code.gs).
4. Bấm dấu **+** cạnh "Tệp" → **HTML**, đặt tên là `Index` (đúng chữ I hoa, không gõ đuôi `.html`), rồi dán nội dung file [`apps-script/Index.html`](apps-script/Index.html).
5. Bấm 💾 **Lưu**.

### Bước 2: Tạo bảng mẫu
1. Quay lại Google Sheet và **tải lại trang** (F5). Trên thanh menu sẽ xuất hiện mục **📋 Tra cứu điểm**.
2. Chọn **📋 Tra cứu điểm → 1. Tạo bảng mẫu**.
   - Lần đầu, Google sẽ hỏi quyền. Bấm **Tiếp tục**, chọn tài khoản của bạn.
   - Nếu thấy cảnh báo "Google chưa xác minh ứng dụng này", bấm **Nâng cao → Đi tới … (không an toàn)** → **Cho phép**.
     Cảnh báo này là bình thường vì đây là mã do chính bạn tạo.

### Bước 3: Nhập danh sách học sinh và tạo mã
1. Ở tab **HocSinh**: nhập `Mã HS`, `Họ tên`, `Lớp` cho từng em. `Mã HS` là mã nội bộ do bạn tự đặt (ví dụ HS001) và không được trùng nhau.
2. Chọn **📋 Tra cứu điểm → 2. Tạo mã tra cứu cho học sinh chưa có mã**. Cột `Mã tra cứu` sẽ được điền tự động, ví dụ `K7X9-2QMP`.

### Bước 4: Xuất bản trang tra cứu
1. Trong cửa sổ Apps Script, bấm **Triển khai (Deploy) → Tùy chọn triển khai mới (New deployment)**.
2. Bấm biểu tượng ⚙️ ở mục "Chọn loại", chọn **Ứng dụng web (Web app)**.
3. Thiết lập:
   - **Thực thi với tư cách (Execute as): Tôi (Me)**
   - **Người có quyền truy cập (Who has access): Bất kỳ ai (Anyone)**
4. Bấm **Triển khai** và sao chép **URL ứng dụng web** (có dạng `https://script.google.com/macros/s/…/exec`).
5. Quay lại Sheet, chọn **📋 Tra cứu điểm → 3. Lưu link trang tra cứu**, rồi dán link vừa sao chép.

> Nếu bạn dùng tài khoản Google do trường cấp (Google Workspace), có thể không có lựa chọn "Bất kỳ ai".
> Khi đó hãy dùng tài khoản Gmail cá nhân, hoặc nhờ quản trị viên của trường bật quyền này.

### Bước 5: Gửi mã cho phụ huynh
1. Chọn **📋 Tra cứu điểm → 4. Tạo tin nhắn gửi phụ huynh**. Tab **TinNhan** sẽ có sẵn tin nhắn cho từng em.
2. Sao chép từng tin nhắn và **gửi riêng (nhắn 1-1)** qua Zalo cho đúng phụ huynh của em đó.
   Mỗi phụ huynh chỉ cần nhận mã một lần, mã dùng được cả năm học.

---

## Dùng hằng ngày

### Nhập điểm đợt mới
- Tạo tab mới có **tên bắt đầu bằng "Điểm"**, ví dụ `Điểm Cuối kỳ I` hoặc `Điểm 15 phút lần 2`.
- Dòng đầu tiên là tiêu đề, bắt buộc có cột **`Mã HS`**. Các cột còn lại tùy ý: tên môn, điểm, nhận xét…
- Phụ huynh sẽ thấy các tab này ngay, không cần triển khai lại.

| Mã HS | Họ tên | Toán | Ngữ văn | Nhận xét | #Ghi chú riêng |
|-------|--------|------|---------|----------|----------------|
| HS001 | Nguyễn Văn An | 8,5 | 7 | Chăm chỉ | *(phụ huynh không thấy)* |

### Mẹo
- **Ẩn một cột với phụ huynh:** đặt tiêu đề cột bắt đầu bằng dấu `#`, ví dụ `#Ghi chú riêng`.
- **Chưa muốn công bố một đợt điểm:** ẩn tab đó (chuột phải vào tab → Ẩn trang tính). Tab bị ẩn sẽ không hiện cho phụ huynh.
- **Phụ huynh làm lộ mã hoặc quên mã:** mở tab `HocSinh`, chọn một ô trên dòng của em đó, rồi chọn
  **📋 Tra cứu điểm → Cấp lại mã cho học sinh đang chọn**. Mã cũ sẽ hết hiệu lực ngay.
- **Thêm học sinh mới:** thêm dòng vào tab `HocSinh`, rồi chạy lại **bước 2 (tạo mã)**. Các mã đã có được giữ nguyên.

### Khi sửa mã Apps Script
Sau khi sửa `Code.gs` hoặc `Index.html`, vào **Triển khai → Quản lý các lượt triển khai → ✏️ Chỉnh sửa →
Phiên bản: Phiên bản mới → Triển khai**. Làm như vậy thì **link vẫn giữ nguyên**, không phải gửi lại cho phụ huynh.

---

## Vì sao cách này an toàn?
- **File Sheet là riêng tư.** Phụ huynh không mở được file và chỉ nhận được dữ liệu qua trang tra cứu.
- **Trang tra cứu chỉ trả về điểm của đúng một học sinh** ứng với mã đã nhập.
- **Mã tra cứu ngẫu nhiên** gồm 8 ký tự, khoảng 850 tỷ khả năng, nên không thể đoán. Mã không dựa trên tên hay ngày sinh.
- **Chống dò mã:** mỗi lần nhập sai bị chậm 1 giây. Nếu cả hệ thống có quá 30 lần nhập sai trong một phút, trang tra cứu tạm khóa.
- Các chức năng của giáo viên (tạo mã, cấp lại mã…) chỉ chạy được từ trong Sheet, không gọi được từ trang tra cứu.
- Ở đầu trang tra cứu, phụ huynh sẽ thấy dòng chữ "Ứng dụng này được tạo bởi một người dùng Google Apps Script". Đây là thông báo mặc định của Google.

## Cấu trúc thư mục
```
apps-script/
  Code.gs           Mã xử lý: tra cứu, tạo mã, menu cho giáo viên
  Index.html        Trang tra cứu cho phụ huynh (tối ưu cho điện thoại)
  appsscript.json   Cấu hình (múi giờ VN, quyền web app); chỉ cần khi dùng công cụ clasp
```
Có thể đổi tiêu đề trang, độ dài mã và giới hạn số lần nhập sai trong biến `CAU_HINH` ở đầu file `Code.gs`.
