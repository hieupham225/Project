# Nhật ký phiên bản

## v1.1 (1.1.0) — 15/11/2026

Thử nghiệm trên staging (https://phieu-ket-qua-staging.ketquahoctap.workers.dev). Khi đưa lên production cần chạy migration theo thứ tự **0003 → 0004 → 0005 → 0006**.

**Nhiều môn, cấu trúc đề**
- Bộ chấm chạy theo **cấu trúc đề**: có sẵn THPT 2025 cho Toán, Vật lí, Hóa học, Sinh học, Lịch sử, Địa lí, Tiếng Anh. Phần III (6 câu) của Toán, Lý, Hóa, Sinh, Địa là dạng **Tự luận** (giáo viên chấm, nhập cột "Điểm tự luận").
- Lớp có **môn**; khi gửi kết quả tự gợi ý cấu trúc theo môn, đổi được.
- Tab **Cấu trúc đề** (quản trị): tạo mới hoặc nhân bản rồi sửa (dạng bài, số câu, điểm mỗi câu, bảng điểm đúng sai); cấu trúc có sẵn không sửa được; không xóa khi đang dùng.
- Dạng bài: Trắc nghiệm ABCD, Đúng / Sai, Trả lời ngắn (tự chấm đáp số), Tự luận (giáo viên chấm), Điền từ, Sắp xếp.
- File đáp án có cột **"Dạng bài"** ở tab CauHoi: quyết định câu thuộc phần nào và cách chấm; cột "Phần" chỉ để nhóm. Lệch với cấu trúc đề thì cảnh báo.
- Tab CauHoi hỗ trợ **mã đề đảo câu**: mỗi hàng là 1 câu đề gốc, cột mã đề (101, 102…) ghi số thứ tự câu đó trong mã đề.
- **Ưu tiên điểm hệ thống chấm** từ file kết quả + đáp án; cột điểm giáo viên chỉ dùng cho phần không có bài làm. Lệch thì cảnh báo ở màn xem trước (từng học sinh: điểm file ≠ điểm chấm).

**Mẫu phiếu**
- Tab **Mẫu phiếu**: tạo từ **file Word trộn thư** hoặc **Word thường** (tự nhận chỗ thay đổi theo file Excel kết quả), hoặc từ mẫu có sẵn. Chọn mẫu khi gửi kết quả.
- Trình chỉnh mẫu **3 cột**: thông tin chung · phiếu · sửa mục đang chọn (danh sách mục khi chưa chọn); mục đang chọn tô cam; mỗi lựa chọn dữ liệu ghi rõ "Lấy từ: …"; trường Logo.
- **Phần tự động** dạng thẻ **kéo thả** vào phiếu: Bảng phân tích từng câu (theo dạng bài, đổi tiêu đề, đổi thứ tự), Điểm các phần (mỗi dòng = nhãn + dạng bài tính điểm, thêm / bớt / sắp xếp), Kết quả các lần làm, Xếp hạng, Nhận xét.

**Học sinh, lớp, điểm**
- **Số báo danh** (4–12 chữ số) cho học sinh; ghép kết quả ưu tiên theo SBD. Nút **tải mẫu phiếu nhập lớp** (Excel).
- **Bảng mã tra cứu** cho cả lớp xuất Word (Họ tên – Lớp – SBD – Mã tra cứu).
- **Sửa điểm từng phần** ngay trên app (trong thẻ học sinh trên điện thoại).
- **Nhóm lớp theo năm sinh** (suy từ ngày sinh của học sinh).
- Nhận các tên cột điểm không có chữ "Điểm" ("Tự luận", "Tổng"…), cột "Ưu và nhược điểm" và nhãn "Điểm cần lưu ý".
- File mẫu tải về: tab **HuongDan** đứng đầu; cột "Điểm tự luận".

**Sửa lỗi**
- Popup danh sách phiếu: tiêu đề bảng dính sát mép trên khi cuộn.
- Trình duyệt dùng bản script cũ trong bộ nhớ đệm (đường dẫn script gắn phiên bản).
- Nhiều nút bị tắt sai do thuộc tính `disabled="null"`.

## v1 (1.0.0) — 15/11/2026

Bản chính thức đầu tiên của **Phiếu kết quả học tập** (https://phieu-ket-qua.ketquahoctap.workers.dev).

**Giáo viên (/gv)**
- Tự đăng ký không gian riêng; mời giáo viên khác và phân quyền theo lớp.
- **Lớp học:** thẻ lớp kèm số liệu (học sinh, bài thi, lần thi, điểm TB); trang chi tiết lớp với danh sách học sinh và bài thi; đổi tên, xóa lớp (học sinh được giữ lại).
- **Học sinh:** thêm thủ công hoặc nhập Excel; một học sinh có thể học nhiều lớp với một mã tra cứu; sao chép mã, soạn tin nhắn gửi phụ huynh, cấp lại mã.
- **Gửi kết quả thi:** tải lên bảng kết quả (có cột Lớp) và bảng đáp án theo mã đề; tự ghép vào đúng lớp, đúng học sinh, tạo lớp và học sinh mới khi cần; chọn nhiều dòng cùng lúc; tạo phiếu có thanh tiến độ, hủy và thử lại.
- **Bài thi:** công bố / ngừng công bố; sửa tiêu đề, mô tả, ngày thi (có thể áp dụng cho tất cả các lớp có bài thi đó); xem phiếu theo thứ hạng với huy hiệu #1–#3.
- **Tổng hợp:** bảng điểm học sinh × các lần thi, điểm trung bình, tiến bộ, huy hiệu hạng theo điểm trung bình; xem dạng biểu đồ đường (so với TB lớp); sao chép bảng sang Excel, chụp ảnh biểu đồ.
- **Cài đặt:** tên trung tâm, khẩu hiệu, logo — áp dụng cho cả các phiếu đã tạo.
- Giao diện theo design system Astryx, hỗ trợ điện thoại (bảng thành thẻ, hộp thoại thành sheet, xử lý bàn phím iPhone).

**Phụ huynh (/)**
- Tra cứu bằng một mã; xem phiếu theo từng lớp/bài thi/lần làm, tải PDF.
- Biểu đồ tiến bộ có đường so sánh với trung bình lớp.
