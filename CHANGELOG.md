# Nhật ký phiên bản

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
