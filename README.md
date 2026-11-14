# Hệ thống phiếu kết quả học tập — tra cứu riêng cho từng phụ huynh

Giáo viên **quản lý danh sách học sinh** và **gửi file Excel kết quả thi**. Hệ thống tự đọc kết quả, chấm và tính điểm,
xuất **một phiếu PDF cho mỗi học sinh** (có gắn mã phiếu). Phụ huynh nhập **mã tra cứu riêng** và **chỉ xem được phiếu của con mình**.

```
Giáo viên                                                     Phụ huynh
─────────                                                     ─────────
Quản lý học sinh ──► mỗi em 1 Mã HS + 1 mã tra cứu ──(nhắn riêng 1 lần)──► nhận mã
Gửi file Excel kết quả ──► đọc, chấm, tính điểm ──► PDF / học sinh ──► Công bố ──► nhập mã → xem phiếu của con
```

| Quản lý học sinh | Gửi kết quả thi |
|---|---|
| ![Học sinh](docs/gv-hoc-sinh.png) | ![Gửi kết quả](docs/gv-gui-ket-qua.png) |

| Phụ huynh: danh sách phiếu | Phụ huynh: xem phiếu |
|---|---|
| ![Danh sách phiếu](docs/man-hinh-danh-sach.png) | ![Xem phiếu](docs/man-hinh-phieu.png) |

- Miễn phí: chạy trên Google Sheet + Apps Script của giáo viên, dữ liệu nằm trong Drive của giáo viên.
- Link trang tra cứu là link chung, có thể gửi vào nhóm Zalo vì link không chứa thông tin của ai.
- Phiếu có bố cục giống mẫu "Phân tích bài thi": thông tin chung, 3 phần đề thi, đáp án của học sinh (đúng **xanh**, sai **đỏ**), nhận xét, lời khuyên.

---

## A. Cài đặt (làm một lần, khoảng 15 phút)

### A1. Tạo file và dán mã
1. Vào https://sheets.new để tạo một Google Sheet mới, ví dụ đặt tên "Quản lý kết quả học tập". **Không chia sẻ file này cho ai.**
2. Chọn **Tiện ích mở rộng → Apps Script**.
3. Trong file `Code.gs`: xóa hết nội dung có sẵn, rồi dán toàn bộ nội dung file [`apps-script/Code.gs`](apps-script/Code.gs).
4. Tạo thêm 3 file HTML: bấm **+** cạnh "Tệp" → **HTML**, đặt tên **đúng như sau** (không gõ đuôi `.html`), rồi dán nội dung tương ứng:

   | Tên file | Dán nội dung từ |
   |---|---|
   | `Index` | [`apps-script/Index.html`](apps-script/Index.html) — trang tra cứu cho phụ huynh |
   | `GiaoVien` | [`apps-script/GiaoVien.html`](apps-script/GiaoVien.html) — bảng điều khiển của giáo viên |
   | `Phieu` | [`apps-script/Phieu.html`](apps-script/Phieu.html) — bố cục phiếu kết quả |

5. Bấm 💾 **Lưu**.

### A2. Xuất bản trang tra cứu cho phụ huynh
1. Trong Apps Script, bấm **Triển khai → Tùy chọn triển khai mới** → ⚙️ → **Ứng dụng web**.
2. Thiết lập:
   - **Thực thi với tư cách: Tôi**
   - **Người có quyền truy cập: Bất kỳ ai**
3. Bấm **Triển khai** và sao chép link `https://script.google.com/macros/s/…/exec`.

> Tài khoản Google do trường cấp (Workspace) có thể không có lựa chọn "Bất kỳ ai".
> Khi đó hãy dùng Gmail cá nhân, hoặc nhờ quản trị viên của trường bật quyền này.

### A3. Mở bảng điều khiển
1. Quay lại Google Sheet và tải lại trang (F5). Chọn **📋 Kết quả học tập → Mở bảng điều khiển**.
2. Lần đầu, Google sẽ hỏi quyền. Bấm **Tiếp tục**, chọn tài khoản của bạn.
   Nếu thấy cảnh báo "Google chưa xác minh ứng dụng này", bấm **Nâng cao → Đi tới … (không an toàn)** → **Cho phép**.
   Cảnh báo này là bình thường vì đây là mã do chính bạn tạo.
3. Vào thẻ **⚙️ Cài đặt**:
   - Dán **link trang tra cứu** (bước A2).
   - Điền **tên trung tâm**, **khẩu hiệu** và **link logo** (ảnh PNG/JPG trên Drive của bạn) để in lên phiếu.
   - Bấm **Lưu cài đặt**.

---

## B. Quản lý học sinh (thẻ 👩‍🎓 Học sinh)

| Việc cần làm | Cách làm |
|---|---|
| Thêm 1 học sinh | **+ Thêm học sinh**, nhập họ tên, lớp, SĐT phụ huynh… Mã HS và mã tra cứu được tự cấp. |
| Thêm cả lớp | **Thêm nhiều / nhập Excel**: dán các cột *Họ tên – Lớp – SĐT phụ huynh* từ Excel, hoặc chọn file Excel danh sách lớp. |
| Gửi mã cho phụ huynh | **Tin nhắn** (từng em) hoặc **Tin nhắn gửi mã (cả lớp)**, rồi **Sao chép** và nhắn **riêng 1-1** qua Zalo. |
| Phụ huynh làm lộ mã hoặc quên mã | **Cấp lại mã**: mã cũ hết hiệu lực ngay. Nhớ gửi mã mới cho phụ huynh. |
| Sửa / xóa | Nút **Sửa** / **Xóa** trên từng dòng. Tìm nhanh bằng ô tìm kiếm và bộ lọc lớp. |

Không nhập danh sách trước cũng được: lần đầu gửi kết quả thi, hệ thống sẽ tự thêm học sinh mới vào danh sách.

---

## C. Gửi kết quả thi (thẻ 📤 Gửi kết quả thi)

### C1. File Excel kết quả theo mẫu
Dùng file mẫu [`mau/Mau_ket_qua_thi.xlsx`](mau/Mau_ket_qua_thi.xlsx), hoặc bấm **Tạo file mẫu trên Drive** trong bảng điều khiển.

| Tab | Nội dung |
|---|---|
| **KetQua** | Mỗi học sinh một dòng: `STT`, `Mã HS` (nên có), `Họ và tên`, `Lớp`, `Mã đề`, đáp án học sinh chọn `I.1…I.12`, `II.1…II.4` (vd `Đ,S,Đ,S`), `III.1…III.6`, các cột điểm, `Ưu điểm`, `Nhược điểm`, `Hướng khắc phục`, `Lời khuyên`. |
| **DeThi** | Mỗi câu một dòng: `Phần` (I/II/III), `Câu`, `Chủ đề kiến thức`, `Mức độ`, `Nội dung phân tích cụ thể`, `Đáp án đúng`. Nhiều mã đề thì thêm cột `Đáp án mã 106`, `Đáp án mã 107`… |
| **ThongTin** | Tiêu đề phiếu (cũng là tên đợt mặc định), mô tả, nhãn lớp, thang điểm, mô tả từng phần. |
| HuongDan | Hướng dẫn điền, hệ thống không đọc tab này. |

**Tự tính điểm:** cột điểm nào để trống thì hệ thống tự tính:
- Phần I: 0,25 điểm mỗi câu đúng.
- Phần II: tính theo số ý đúng trong câu (1 ý: 0,1 – 2 ý: 0,25 – 3 ý: 0,5 – 4 ý: 1 điểm).
- Phần III: 0,5 điểm mỗi câu đúng.
- Tổng điểm: cộng 3 phần.

Nếu giáo viên đã nhập điểm (ví dụ chấm tay phần tự luận) thì hệ thống dùng điểm giáo viên nhập.
Muốn thêm hoặc bớt câu: thêm/xóa cột trong KetQua (vd `I.13`) và dòng tương ứng trong DeThi.

### C2. Các bước
1. **Chọn file Excel** (hoặc dán link Google Sheet). Hệ thống đọc và hiện bảng kiểm tra cho từng học sinh: tổng điểm và trạng thái
   *✔ đã có trong danh sách* / *Mới — sẽ thêm* / *Lỗi* (ví dụ trùng tên mà không có Mã HS).
2. Bấm **👁 Xem thử phiếu** để xem phiếu của học sinh đầu tiên.
3. Kiểm tra **Tên đợt thi**, rồi bấm **Tạo phiếu PDF**. Thanh tiến độ chạy; một lớp 40 em mất khoảng vài phút.
4. Mở **thư mục PDF** để kiểm tra vài phiếu, rồi bấm **📢 Công bố cho phụ huynh xem**.

Gửi lại file của cùng một đợt (cùng tên) thì hệ thống hỏi xác nhận, sau đó **thay thế** toàn bộ phiếu cũ của đợt đó.

### C3. Các đợt thi (thẻ 🗂️)
Danh sách các đợt đã gửi. Tại đây có thể **công bố / ẩn** với phụ huynh, mở thư mục PDF, hoặc **xóa đợt** (file PDF chuyển vào Thùng rác).

---

## D. Phụ huynh tra cứu
1. Mở link trang tra cứu (link chung của lớp).
2. Nhập mã tra cứu đã nhận riêng, ví dụ `K7X9-2QMP`.
3. Trang hiện danh sách phiếu các đợt **đã công bố** của con, kèm tổng điểm. Bấm vào một phiếu để xem ngay trên điện thoại, hoặc bấm **Tải PDF**.

---

## Vì sao an toàn?
- **File Sheet, các phiếu PDF và thư mục đều riêng tư** trong Drive của giáo viên. Không file nào được chia sẻ.
- Trang tra cứu **kiểm tra mã ở mỗi lần xem**. Mỗi mã chỉ mở được phiếu của đúng học sinh đó, và chỉ những đợt đã công bố.
- **Mã tra cứu ngẫu nhiên** gồm 8 ký tự (khoảng 850 tỷ khả năng), không dựa trên tên hay ngày sinh. Mã phiếu in trên PDF không dùng để tra cứu được.
- **Chống dò mã:** mỗi lần nhập sai bị chậm 1 giây. Nếu cả hệ thống có quá 30 lần nhập sai trong một phút, trang tra cứu tạm khóa.
- **Các chức năng của giáo viên chỉ chạy khi người dùng là chủ file.** Người mở trang tra cứu công khai không gọi được các chức năng này.

## Tùy chỉnh
- **Giao diện phiếu:** sửa file `Phieu.html` (màu, cỡ chữ, tiêu đề các phần…).
- **Thang điểm, độ dài mã, giới hạn nhập sai:** sửa biến `CAU_HINH` ở đầu `Code.gs`.
- **Sau khi sửa mã:** vào **Triển khai → Quản lý các lượt triển khai → ✏️ → Phiên bản mới → Triển khai**. Làm như vậy thì link tra cứu giữ nguyên.

## Cấu trúc thư mục
```
apps-script/
  Code.gs          Máy chủ: quản lý học sinh, đọc file kết quả, chấm điểm, tạo PDF, tra cứu
  GiaoVien.html    Bảng điều khiển của giáo viên (mở từ Google Sheet)
  Index.html       Trang tra cứu cho phụ huynh (xem PDF ngay trên điện thoại)
  Phieu.html       Bố cục phiếu kết quả
  appsscript.json  Cấu hình (chỉ cần khi dùng công cụ clasp)
mau/
  Mau_ket_qua_thi.xlsx   File Excel mẫu kết quả thi
tools/
  tao-file-mau.js        Sinh lại file Excel mẫu từ Code.gs (npm install xlsx@0.18.5 && node tools/tao-file-mau.js)
docs/                    Ảnh minh họa
```

Dữ liệu được lưu trong các tab của Google Sheet: `HocSinh`, `DotThi`, `PhieuKetQua`. Nên thao tác qua bảng điều khiển; sửa trực tiếp trên tab sẽ có cảnh báo.
