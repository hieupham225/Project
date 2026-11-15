# Kế hoạch v2 — Bộ chấm dùng cho nhiều môn

Mục tiêu: thay phần đang cố định cho môn Toán (3 phần I/II/III) bằng **cấu trúc đề mô tả bằng dữ liệu**. Bộ chấm, file mẫu Excel và phiếu đều chạy theo cấu trúc đó, nên thêm môn mới chỉ cần khai báo cấu trúc, không phải viết lại code.

## Quyết định đã chốt (15/11/2026)

| Vấn đề | Quyết định |
|---|---|
| Môn ưu tiên sau Toán | **Lý / Hóa / Sinh** và **Tiếng Anh** |
| Dạng đề | **Cả hai**: có sẵn mẫu THPT 2025 cho từng môn, và quản trị tạo được cấu trúc riêng (đề 15 phút, 45 phút…) |
| Ai tạo / sửa cấu trúc đề | **Chỉ quản trị.** Giáo viên chỉ chọn cấu trúc khi gửi kết quả |
| Chọn cấu trúc khi gửi kết quả | Lớp có **môn mặc định**, hệ thống tự gợi ý cấu trúc của môn đó; giáo viên **đổi được** khi gửi |
| Chủ đề kiến thức | **Giữ như hiện tại**: gõ trong file đáp án, chưa làm ngân hàng chủ đề |
| Tự luận | **Dạng linh hoạt**: mặc định nhập tổng điểm phần tự luận; nếu cấu trúc có khai báo tiêu chí thì nhập điểm theo từng tiêu chí. Hỏi giáo viên Văn rồi chỉnh mẫu sau |
| Tiếng Anh | Cần đủ 4 dạng: trắc nghiệm A–D, điền từ / viết lại câu, sắp xếp câu / đoạn, viết đoạn văn (tự luận) |

## Dạng câu hỏi (module)

Mỗi dạng câu là một module gồm 4 việc: **đọc đáp án → chấm một câu → hiển thị trên phiếu → sinh cột trong file mẫu**.

| Dạng | Dùng cho | Cách chấm |
|---|---|---|
| `trac_nghiem` | Mọi môn; số phương án đặt được (ABCD, ABCDE) | Đúng/sai × điểm mỗi câu |
| `dung_sai` | Phần II các môn THPT 2025 | Theo số ý đúng, bảng điểm cấu hình được (mặc định 0 / 0,1 / 0,25 / 0,5 / 1) |
| `tra_loi_ngan` | Phần III Toán, Lý, Hóa, Sinh | Khớp đáp án sau khi chuẩn hóa số (`0,5` = `0.5`; làm tròn theo cấu hình) |
| `dien_tu` | Tiếng Anh: điền từ, viết lại câu | Khớp với **một trong nhiều đáp án đúng** (ngăn bằng `/`), không phân biệt hoa thường, bỏ khoảng trắng thừa và dấu câu cuối |
| `sap_xep` | Tiếng Anh: sắp xếp câu / đoạn | Khớp đúng thứ tự (`a-c-b-d`, `acbd`, `a,c,b,d` coi như nhau) |
| `tu_luan` | Văn, viết đoạn văn Tiếng Anh, câu tự luận các môn | Không chấm tự động. Nhập tổng điểm phần, hoặc điểm từng tiêu chí nếu cấu trúc có khai báo; nhận xét theo tiêu chí (tùy chọn) |
| `nhap_diem` | Đề không theo mẫu | Chỉ nhận điểm từng phần, không phân tích từng câu |

## Cấu trúc đề có sẵn

| Cấu trúc | Các phần |
|---|---|
| THPT 2025 – Toán (= v1) | I: 12 câu `trac_nghiem` × 0,25 · II: 4 câu `dung_sai` · III: 6 câu `tra_loi_ngan` × 0,5 |
| THPT 2025 – Vật lí / Hóa học / Sinh học | I: 18 câu × 0,25 · II: 4 câu `dung_sai` · III: 6 câu `tra_loi_ngan` × 0,25 |
| THPT 2025 – Địa lí | I: 18 câu × 0,25 · II: 4 câu `dung_sai` · III: 6 câu `tra_loi_ngan` × 0,25 |
| THPT 2025 – Lịch sử | I: 24 câu × 0,25 · II: 4 câu `dung_sai` |
| THPT 2025 – Tiếng Anh | 40 câu `trac_nghiem` × 0,25 |
| Tiếng Anh – đề trung tâm (mẫu để chỉnh) | Trắc nghiệm · Điền từ / viết lại câu · Sắp xếp · Viết đoạn văn (`tu_luan`) |

Quản trị nhân bản một cấu trúc rồi sửa số câu, điểm mỗi câu, thêm hoặc bớt phần để tạo đề riêng. Tổng điểm tối đa tự tính; tổng hợp và biểu đồ vẫn quy về thang 10 như v1.

Ví dụ dữ liệu:

```json
{ "mon": "Vật lí", "ten": "THPT 2025 – Vật lí", "thangDiem": 10,
  "phan": [
    { "ma": "I",   "ten": "Trắc nghiệm nhiều phương án", "dang": "trac_nghiem", "soCau": 18, "diemMoiCau": 0.25, "phuongAn": "ABCD" },
    { "ma": "II",  "ten": "Trắc nghiệm đúng sai", "dang": "dung_sai", "soCau": 4, "soY": 4, "bangDiem": [0, 0.1, 0.25, 0.5, 1] },
    { "ma": "III", "ten": "Trả lời ngắn", "dang": "tra_loi_ngan", "soCau": 6, "diemMoiCau": 0.25 } ] }
```

## Dữ liệu

- Bảng mới `cau_truc (id, kg, mon, ten, du_lieu JSON, ngay_tao)`. Các cấu trúc có sẵn dùng chung cho mọi không gian.
- Bảng `lop` thêm cột `mon`; bảng `lan_thi` thêm cột `cau_truc`.
- Mỗi phiếu **lưu kèm bản chụp cấu trúc** lúc tạo. Sửa cấu trúc sau này không làm đổi phiếu cũ.
- Chuyển đổi dữ liệu: mọi lớp và lần thi hiện có gắn môn **Toán** và cấu trúc **THPT 2025 – Toán**.

## Quản lý mẫu phiếu (chốt 15/11/2026)

Thầy cô tạo mẫu phiếu bằng cách **tải lên mẫu Word trộn thư đang dùng**; hệ thống đọc và dựng thành mẫu phiếu web. Mỗi lần gửi kết quả: **chọn môn / cấu trúc đề + chọn mẫu phiếu**.

1. **Tải mẫu (.docx trộn thư) lên** → hệ thống đọc:
   - các trường trộn thư `«Ten_truong»` = chỗ cần điền;
   - bố cục: đoạn văn, chữ đậm/nghiêng/màu/cỡ, căn lề, bảng (gộp ô, viền, nền), ảnh/logo, khổ giấy, lề;
   - điều kiện đơn giản (`IF … "…" "…"`) nếu có.
   → chuyển thành **mẫu phiếu web** giữ bố cục, các trường thành ô chờ điền.
2. **Ghép trường ↔ dữ liệu**: tự ghép theo tên với
   - cột của file Excel trộn thư (lấy thẳng giá trị);
   - dữ liệu hệ thống: họ tên, lớp, SBD, mã tra cứu, điểm từng phần (bộ chấm), đúng/sai từng câu, xếp hạng, điểm lần trước, chênh lệch…
   Thầy cô chỉnh trường ghép sai; **xem thử** phiếu 1 học sinh trước khi lưu.
3. **Thư viện mẫu phiếu** (Cài đặt → Mẫu phiếu): xem, đổi tên, tải lại file Word mới, ẩn. Mỗi mẫu gắn 1 cấu trúc đề (hoặc "chỉ trộn dữ liệu Excel, không chấm"). Mẫu "Phân tích bài thi" hiện tại là mẫu mặc định; phiếu cũ giữ nguyên.
4. **Gửi kết quả**: chọn môn / cấu trúc đề + mẫu phiếu → tải Excel → ghép học sinh (SBD → Mã HS → họ tên) → điền từng phiếu → công bố, tra cứu, PDF như hiện tại. Sửa điểm, Tổng hợp, biểu đồ dùng chung cho mọi mẫu.
5. **Phạm vi theo phiên bản (chốt 15/11/2026)**:
   - **v1.1**: mẫu từ **Word trộn thư** và **Word thông thường** (tự đoán chỗ "nhãn: giá trị mẫu", bôi đen để gắn trường, hoặc gõ `{{Tên trường}}` trong Word) + **trình chỉnh mẫu phiếu** (xem trước với dữ liệu thật, gắn trường, sửa chữ / dòng bảng, khối có sẵn, tạo mẫu từ đầu).
   - **v2**: mẫu từ **ảnh / PDF** bằng AI (Claude đọc ảnh → dựng mẫu web → chỉnh trong trình chỉnh mẫu); cần khóa API, chi phí theo lượt tạo mẫu.
6. **AI hỗ trợ (tùy chọn, làm sau)**: gợi ý ghép tên trường khó hiểu, gợi ý cấu trúc đề từ bảng câu hỏi trong phiếu — cần khóa API, có chi phí mỗi lần phân tích.

Thay cho giai đoạn 3 cũ ("Phiếu tổng quát"). Chờ 2 file Word trộn thư (+ file Excel nguồn) của thầy để kiểm chứng bộ đọc trước khi chốt chi tiết.

## Lộ trình

| Giai đoạn | Việc | Kiểm chứng |
|---|---|---|
| **1. Tách bộ chấm** | Viết các module dạng câu và bộ chấm chung `chamBai_(kq, h, cauTruc)`. Chuyển Toán thành cấu trúc dữ liệu. | Toàn bộ kiểm thử v1 vẫn qua. File thật 117 học sinh ra **đúng điểm như v1**. |
| **2. Dữ liệu + chọn môn** | Bảng `cau_truc`, môn của lớp, chuyển đổi dữ liệu. Thêm ô chọn **Môn / cấu trúc đề** khi gửi kết quả. File mẫu kết quả và đáp án sinh theo cấu trúc; báo lỗi khi file không khớp cấu trúc. | Gửi được đề Lý (18/4/6) và đề Tiếng Anh 40 câu, ra đúng số câu và tổng 10. |
| **3. Mẫu phiếu từ Word** | Bộ đọc .docx trộn thư → mẫu phiếu web; ghép trường ↔ dữ liệu; thư viện mẫu phiếu; chọn mẫu khi gửi kết quả. Mẫu "Phân tích bài thi" là mặc định. | 2 file Word của thầy dựng ra phiếu web giống bản Word; phiếu Toán cũ không đổi. |
| **4. Tiếng Anh đủ dạng + tự luận** | Các dạng `dien_tu`, `sap_xep`, `tu_luan` (tổng điểm hoặc theo tiêu chí). | Gửi được đề Tiếng Anh trung tâm có đủ 4 dạng. |
| **5. Cấu trúc đề** (✅ staging 15/11: tab riêng, nhân bản / sửa / xóa; migration 0006) | Quản trị xem, nhân bản, sửa, ẩn cấu trúc. Lớp chọn môn mặc định. | Quản trị tự tạo được đề "15 câu trắc nghiệm + 2 câu tự luận" và gửi được. |
| **6. Báo cáo theo môn** | Tổng hợp lọc theo môn; trang phụ huynh tách biểu đồ theo môn. | — |

Giai đoạn 1–3 cho ra bản dùng được với Toán, Lý, Hóa, Sinh và Tiếng Anh trắc nghiệm. Giai đoạn 4–5 hoàn thiện Tiếng Anh đủ dạng và đề tự tạo.

## Chốt thêm (15/11/2026)

- **Dạng bài quyết định mọi thứ**: tab CauHoi của file đáp án có cột **"Dạng bài"** (Trắc nghiệm ABCD / Đúng sai / Tự luận…). Câu vào khối phân tích nào, chấm thế nào, điểm phần — đều theo dạng bài; cột "Phần" chỉ để nhóm. Khối phân tích trong mẫu phiếu chọn theo dạng bài (danh sách dạng theo môn của mẫu), đổi thứ tự, đổi tiêu đề tùy ý.
- **Ưu tiên điểm chấm từ file kết quả + file đáp án.** Cột điểm giáo viên nhập chỉ dùng cho phần không chấm được (không có bài làm, VD tự luận chấm tay). Lệch thì cảnh báo ở màn xem trước khi tạo phiếu (tên học sinh, điểm file ≠ điểm chấm).
- **Cấu trúc đề tự tạo**: cấu trúc THPT 2025 có sẵn không sửa được; quản trị nhân bản rồi sửa bản sao (dạng bài, số câu, điểm mỗi câu, bảng điểm đúng sai). Không xóa được khi đang dùng.
- Khi đưa lên production: chạy migration theo thứ tự 0003 → 0004 → 0005 → 0006.

## Rủi ro và cách giữ an toàn

- **Điểm Toán không được thay đổi:** giai đoạn 1 có bước đối chiếu với file thật trước khi đưa lên.
- **Phiếu đã công bố không bị đụng tới:** mỗi phiếu đã lưu dữ liệu riêng, kèm bản chụp cấu trúc.
- **Giới hạn gói Cloudflare miễn phí:** cấu trúc chỉ đọc một lần cho mỗi lần gửi, không làm tăng số truy vấn theo số học sinh.

## Việc còn mở

- Hỏi giáo viên Văn và giáo viên Tiếng Anh cách chấm bài viết (có barem theo tiêu chí không, mỗi tiêu chí bao nhiêu điểm) để chỉnh mẫu tự luận.
- Xin một đề Tiếng Anh thật của trung tâm để làm mẫu cấu trúc "Tiếng Anh – đề trung tâm".
