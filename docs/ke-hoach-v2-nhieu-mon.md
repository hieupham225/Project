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

## Lộ trình

| Giai đoạn | Việc | Kiểm chứng |
|---|---|---|
| **1. Tách bộ chấm** | Viết các module dạng câu và bộ chấm chung `chamBai_(kq, h, cauTruc)`. Chuyển Toán thành cấu trúc dữ liệu. | Toàn bộ kiểm thử v1 vẫn qua. File thật 117 học sinh ra **đúng điểm như v1**. |
| **2. Dữ liệu + chọn môn** | Bảng `cau_truc`, môn của lớp, chuyển đổi dữ liệu. Thêm ô chọn **Môn / cấu trúc đề** khi gửi kết quả. File mẫu kết quả và đáp án sinh theo cấu trúc; báo lỗi khi file không khớp cấu trúc. | Gửi được đề Lý (18/4/6) và đề Tiếng Anh 40 câu, ra đúng số câu và tổng 10. |
| **3. Phiếu tổng quát** | `phieu.js` vẽ phiếu theo từng phần và từng dạng câu. Phiếu cũ vẫn mở bằng đường hiển thị cũ. | Phiếu Toán cũ trước và sau khi đổi giống hệt. |
| **4. Tiếng Anh đủ dạng + tự luận** | Các dạng `dien_tu`, `sap_xep`, `tu_luan` (tổng điểm hoặc theo tiêu chí). | Gửi được đề Tiếng Anh trung tâm có đủ 4 dạng. |
| **5. Cài đặt → Cấu trúc đề** | Quản trị xem, nhân bản, sửa, ẩn cấu trúc. Lớp chọn môn mặc định. | Quản trị tự tạo được đề "15 câu trắc nghiệm + 2 câu tự luận" và gửi được. |
| **6. Báo cáo theo môn** | Tổng hợp lọc theo môn; trang phụ huynh tách biểu đồ theo môn. | — |

Giai đoạn 1–3 cho ra bản dùng được với Toán, Lý, Hóa, Sinh và Tiếng Anh trắc nghiệm. Giai đoạn 4–5 hoàn thiện Tiếng Anh đủ dạng và đề tự tạo.

## Rủi ro và cách giữ an toàn

- **Điểm Toán không được thay đổi:** giai đoạn 1 có bước đối chiếu với file thật trước khi đưa lên.
- **Phiếu đã công bố không bị đụng tới:** mỗi phiếu đã lưu dữ liệu riêng, kèm bản chụp cấu trúc.
- **Giới hạn gói Cloudflare miễn phí:** cấu trúc chỉ đọc một lần cho mỗi lần gửi, không làm tăng số truy vấn theo số học sinh.

## Việc còn mở

- Hỏi giáo viên Văn và giáo viên Tiếng Anh cách chấm bài viết (có barem theo tiêu chí không, mỗi tiêu chí bao nhiêu điểm) để chỉnh mẫu tự luận.
- Xin một đề Tiếng Anh thật của trung tâm để làm mẫu cấu trúc "Tiếng Anh – đề trung tâm".
