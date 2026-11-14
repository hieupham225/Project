/**
 * HỆ THỐNG PHIẾU KẾT QUẢ HỌC TẬP — TRA CỨU RIÊNG CHO TỪNG PHỤ HUYNH
 * ------------------------------------------------------------------
 * Giáo viên (bảng điều khiển mở từ Google Sheet):
 *   - Quản lý học sinh: thêm / sửa / xóa / nhập hàng loạt, mỗi em có 1 mã tra cứu ngẫu nhiên.
 *   - Gửi kết quả thi: chọn file Excel theo mẫu -> hệ thống đọc, chấm, tính điểm,
 *     xuất 1 phiếu PDF / học sinh (gắn mã phiếu), lưu riêng tư trong Drive của giáo viên.
 *   - Quản lý đợt thi: công bố / ẩn / xóa.
 * Phụ huynh (trang web công khai): nhập mã tra cứu -> chỉ xem được phiếu của con mình.
 *
 * File trong dự án Apps Script:
 *   Code.gs        (file này)  máy chủ
 *   Index.html     trang tra cứu cho phụ huynh
 *   GiaoVien.html  bảng điều khiển của giáo viên
 *   Phieu.html     bố cục phiếu kết quả (sửa file này để đổi giao diện phiếu)
 *
 * AI DÙNG Ở ĐÂU
 *   - Quản trị (chủ file):   mở Google Sheet -> menu "📋 Kết quả học tập", hoặc đăng nhập trang giáo viên.
 *   - Giáo viên:             mở link  .../exec?gv  -> đăng nhập (tài khoản do quản trị tạo). Không cần cài gì,
 *                            không cần tài khoản Google. Chỉ thấy/quản lý các lớp mình phụ trách.
 *   - Phụ huynh:             mở link  .../exec      -> nhập mã tra cứu.
 *
 * BẢO MẬT
 *   - Hàm kết thúc bằng "_" là hàm riêng, trang web không gọi được.
 *   - Hàm cho phụ huynh: traCuu(), layPhieu() — luôn kiểm tra mã tra cứu.
 *   - Hàm cho giáo viên: gv...() — luôn gọi yeuCauGiaoVien_(). Giáo viên đăng nhập gọi qua gvGoi(phiên, tên hàm, tham số);
 *     gọi thẳng gv...() từ trang công khai (người dùng ẩn danh) bị từ chối.
 *   - Mọi thao tác chạy bằng tài khoản Google của trung tâm, nên dữ liệu và PDF luôn nằm trong Drive của trung tâm.
 */

var CAU_HINH = {
  TIEU_DE_TRA_CUU: 'Tra cứu kết quả học tập',
  SHEET_HOC_SINH: 'HocSinh',
  SHEET_DOT: 'DotThi',
  SHEET_PHIEU: 'PhieuKetQua',
  SHEET_NHOM: 'Nhom',
  SHEET_TAI_KHOAN: 'TaiKhoan',
  THOI_GIAN_PHIEN_GIAY: 6 * 60 * 60, // phiên đăng nhập của giáo viên: 6 giờ (tối đa của CacheService)
  THU_MUC_GOC: 'Phiếu kết quả học tập (tra cứu)',
  DO_DAI_MA: 8,
  KY_TU_MA: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // bỏ 0/O, 1/I/L
  SO_LAN_SAI_TOI_DA_MOI_PHUT: 30,
  // Thang điểm mặc định (dùng khi cột điểm trong file kết quả để trống)
  DIEM_CAU_PHAN_I: 0.25,
  DIEM_CAU_PHAN_III: 0.5,
  DIEM_PHAN_II_THEO_SO_Y_DUNG: [0, 0.1, 0.25, 0.5, 1] // 0,1,2,3,4 ý đúng
};

// Cột 3 'Nhóm / lớp': 1 học sinh có thể thuộc nhiều nhóm, viết cách nhau bằng dấu ;  (vd: Toán 2; Tiếng Anh A1)
var COT_HS = ['Mã HS', 'Họ tên', 'Nhóm / lớp', 'Ngày sinh', 'SĐT phụ huynh', 'Ghi chú', 'Mã tra cứu', 'Ngày tạo'];
// Mỗi dòng DotThi = 1 LẦN LÀM của 1 bài thi trong 1 nhóm (cùng bài thi có thể làm nhiều lần)
var COT_DOT = ['Mã đợt', 'Bài thi', 'Lần', 'Nhóm', 'Ngày thi', 'Ngày tạo', 'Số phiếu', 'Công bố', 'Thư mục'];
var COT_TK = ['Tên đăng nhập', 'Họ tên', 'Vai trò', 'Lớp phụ trách', 'Mật khẩu (đã mã hóa)', 'Muối', 'Trạng thái', 'Ngày tạo'];
var COT_NHOM = ['Tên nhóm / lớp', 'Ghi chú', 'Ngày tạo'];
var COT_PHIEU = ['Mã phiếu', 'Mã đợt', 'Mã HS', 'Họ tên', 'Tổng điểm', 'Điểm tối đa', 'File ID', 'Thời gian'];
var CD = { MA: 1, BAI: 2, LAN: 3, NHOM: 4, NGAY_THI: 5, NGAY_TAO: 6, SO_PHIEU: 7, CONG_BO: 8, THU_MUC: 9 }; // số thứ tự cột DotThi

/* =====================================================================
 * 1. TRANG WEB
 * ===================================================================== */

function doGet(e) {
  var thamSo = (e && e.parameter) || {};
  if (thamSo.gv !== undefined) {
    var g = HtmlService.createTemplateFromFile('GiaoVien');
    g.cheDo = 'web';
    return g.evaluate()
      .setTitle('Giáo viên — ' + (layCaiDat_().tenTrungTam || 'Kết quả học tập'))
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var t = HtmlService.createTemplateFromFile('Index');
  t.tieuDe = layCaiDat_().tieuDeTraCuu || CAU_HINH.TIEU_DE_TRA_CUU;
  return t.evaluate()
    .setTitle(t.tieuDe)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 Kết quả học tập')
    .addItem('Mở bảng điều khiển', 'moBangDieuKhien')
    .addToUi();
}

function moBangDieuKhien() {
  var t = HtmlService.createTemplateFromFile('GiaoVien');
  t.cheDo = 'sheet';
  var html = t.evaluate().setWidth(1150).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'Quản lý kết quả học tập');
}

/* =====================================================================
 * 2. PHỤ HUYNH TRA CỨU
 * ===================================================================== */

function traCuu(maNhap) {
  return chayVoiMa_(maNhap, function (ss, hs) {
    return {
      ok: true,
      hocSinh: { hoTen: hs.hoTen, nhom: hs.nhom },
      phieu: phieuDaCongBo_(ss, hs.maHs).map(function (p) {
        return { maPhieu: p.maPhieu, baiThi: p.baiThi, lan: p.lan, nhom: p.nhom, ngayThi: p.ngayThi,
          tongDiem: p.tongDiem, diemToiDa: p.diemToiDa };
      })
    };
  });
}

function layPhieu(maNhap, maPhieu) {
  return chayVoiMa_(maNhap, function (ss, hs) {
    var p = phieuDaCongBo_(ss, hs.maHs).filter(function (x) { return x.maPhieu === String(maPhieu); })[0];
    if (!p) return { ok: false, loi: 'Không tìm thấy phiếu kết quả.' };
    var file = DriveApp.getFileById(p.fileId);
    return { ok: true, tenFile: file.getName(), pdf: Utilities.base64Encode(file.getBlob().getBytes()) };
  });
}

function chayVoiMa_(maNhap, xuLy) {
  var LOI_SAI_MA = 'Mã tra cứu không đúng. Vui lòng kiểm tra lại mã giáo viên đã gửi.';
  try {
    if (dangBiKhoa_()) return { ok: false, loi: 'Hệ thống đang tạm khóa do có quá nhiều lần nhập sai. Vui lòng thử lại sau 1–2 phút.' };
    var ma = chuanHoaMa_(maNhap);
    if (ma.length !== CAU_HINH.DO_DAI_MA) { ghiNhanSai_(); return { ok: false, loi: LOI_SAI_MA }; }
    var ss = laySpreadsheet_();
    var hs = dsHocSinh_(ss).filter(function (h) { return chuanHoaMa_(h.maTraCuu) === ma; })[0];
    if (!hs) { ghiNhanSai_(); Utilities.sleep(1000); return { ok: false, loi: LOI_SAI_MA }; }
    return xuLy(ss, hs);
  } catch (e) {
    console.error(e);
    return { ok: false, loi: 'Có lỗi xảy ra, vui lòng thử lại sau.' };
  }
}

/** Phiếu của 1 học sinh thuộc các lần thi đã công bố, sắp theo ngày thi (cũ -> mới). */
function phieuDaCongBo_(ss, maHs) {
  var dot = {};
  dsDot_(ss).forEach(function (d) { if (d.congBo) dot[d.maDot] = d; });
  return dsPhieu_(ss)
    .filter(function (p) { return p.maHs === maHs && dot[p.maDot]; })
    .map(function (p) {
      var d = dot[p.maDot];
      p.baiThi = d.baiThi; p.lan = d.lan; p.nhom = d.nhom; p.ngayThi = d.ngayThi; p.thuTu = d.thuTu;
      return p;
    })
    .sort(function (a, b) { return a.thuTu - b.thuTu || a.lan - b.lan; });
}

/* =====================================================================
 * 3. GIÁO VIÊN — DỮ LIỆU CHUNG & CÀI ĐẶT
 * ===================================================================== */

/* ---------- Người dùng hiện tại & phân quyền ----------
 * PHIEN_ được gvGoi() đặt khi giáo viên gọi bằng phiên đăng nhập.
 * Không có phiên -> chỉ chủ file (mở từ Google Sheet) mới được dùng, với quyền quản trị.
 */
var PHIEN_ = null;

function nguoiDung_() {
  if (PHIEN_) return PHIEN_;
  var nguoiDung = Session.getActiveUser().getEmail();
  var chuSoHuu = Session.getEffectiveUser().getEmail();
  if (!nguoiDung || nguoiDung !== chuSoHuu) throw new Error('Không có quyền thực hiện thao tác này.');
  return { ten: nguoiDung, hoTen: 'Quản trị', quanTri: true, lop: '*' };
}

function yeuCauGiaoVien_() { return nguoiDung_(); }

function yeuCauQuanTri_() {
  var nd = nguoiDung_();
  if (!nd.quanTri) throw new Error('Chỉ quản trị mới làm được thao tác này.');
  return nd;
}

/** Người dùng hiện tại có phụ trách lớp này không. */
function duocLop_(nhom) {
  var nd = nguoiDung_();
  if (nd.lop === '*') return true;
  var k = khongDau_(nhom);
  return nd.lop.some(function (n) { return khongDau_(n) === k; });
}

function kiemTraLop_(nhom) {
  if (!duocLop_(nhom)) throw new Error('Bạn không phụ trách lớp "' + nhom + '".');
}

/** Học sinh có ít nhất 1 lớp do người dùng phụ trách. */
function duocHocSinh_(hs) { return nguoiDung_().lop === '*' || hs.nhom.some(duocLop_); }

/* ---------- Đăng nhập cho giáo viên (trang .../exec?gv) ---------- */

var HAM_QUA_PHIEN = ['gvTaiDuLieu', 'gvLuuCaiDat', 'gvLuuHocSinh', 'gvThemNhieuHocSinh', 'gvXoaHocSinh', 'gvCapLaiMa',
  'gvCapNhatNhom', 'gvDoiTenNhom', 'gvTaoNhom', 'gvDocLinkSheet', 'gvXemTruoc', 'gvBatDauDot', 'gvTaoPhieuLo',
  'gvCongBo', 'gvXoaDot', 'gvLayMauLop', 'gvTaoFileMau', 'gvLuuTaiKhoan', 'gvDatLaiMatKhau', 'gvXoaTaiKhoan', 'gvDoiMatKhau'];

/**
 * Cửa duy nhất cho bảng điều khiển: gvGoi(phiên, 'gvTenHam', [tham số]).
 * phiên = '' khi mở từ Google Sheet (chủ file); = mã phiên khi giáo viên đăng nhập trên web.
 */
function gvGoi(phien, ten, thamSo) {
  if (HAM_QUA_PHIEN.indexOf(ten) < 0) throw new Error('Không có chức năng này.');
  var ham = {
    gvTaiDuLieu: gvTaiDuLieu, gvLuuCaiDat: gvLuuCaiDat, gvLuuHocSinh: gvLuuHocSinh, gvThemNhieuHocSinh: gvThemNhieuHocSinh,
    gvXoaHocSinh: gvXoaHocSinh, gvCapLaiMa: gvCapLaiMa, gvCapNhatNhom: gvCapNhatNhom, gvDoiTenNhom: gvDoiTenNhom,
    gvTaoNhom: gvTaoNhom, gvDocLinkSheet: gvDocLinkSheet, gvXemTruoc: gvXemTruoc, gvBatDauDot: gvBatDauDot,
    gvTaoPhieuLo: gvTaoPhieuLo, gvCongBo: gvCongBo, gvXoaDot: gvXoaDot, gvLayMauLop: gvLayMauLop, gvTaoFileMau: gvTaoFileMau,
    gvLuuTaiKhoan: gvLuuTaiKhoan, gvDatLaiMatKhau: gvDatLaiMatKhau, gvXoaTaiKhoan: gvXoaTaiKhoan, gvDoiMatKhau: gvDoiMatKhau
  }[ten];
  PHIEN_ = phien ? docPhien_(phien) : null;
  try { return ham.apply(null, thamSo || []); } finally { PHIEN_ = null; }
}

function gvDangNhap(tenDangNhap, matKhau) {
  var LOI = 'Tên đăng nhập hoặc mật khẩu không đúng.';
  if (dangBiKhoa_()) return { ok: false, loi: 'Tạm khóa do có quá nhiều lần nhập sai. Vui lòng thử lại sau 1–2 phút.' };
  var ss = laySpreadsheet_();
  khoiTao_(ss);
  var tk = dsTaiKhoan_(ss).filter(function (x) { return x.ten === chuanHoaTenDN_(tenDangNhap); })[0];
  if (!tk || !matKhau || bamMatKhau_(String(matKhau), tk.muoi) !== tk.bam) { ghiNhanSai_(); Utilities.sleep(1000); return { ok: false, loi: LOI }; }
  if (tk.trangThai === 'Khóa') return { ok: false, loi: 'Tài khoản đang bị khóa. Liên hệ quản trị trung tâm.' };
  var phien = taoMaNgauNhien_() + taoMaNgauNhien_() + taoMaNgauNhien_() + taoMaNgauNhien_();
  CacheService.getScriptCache().put('phien_' + phien, tk.ten, CAU_HINH.THOI_GIAN_PHIEN_GIAY);
  return { ok: true, phien: phien, hoTen: tk.hoTen, quanTri: tk.vaiTro === 'Quản trị' };
}

function gvDangXuat(phien) {
  if (phien) CacheService.getScriptCache().remove('phien_' + phien);
  return true;
}

/** Đọc phiên -> người dùng (đọc lại tài khoản mỗi lần để áp dụng ngay khi quản trị đổi lớp / khóa). */
function docPhien_(phien) {
  var cache = CacheService.getScriptCache();
  var ten = cache.get('phien_' + phien);
  if (!ten) throw new Error('PHIEN_HET_HAN');
  var tk = dsTaiKhoan_(laySpreadsheet_()).filter(function (x) { return x.ten === ten; })[0];
  if (!tk || tk.trangThai === 'Khóa') { cache.remove('phien_' + phien); throw new Error('PHIEN_HET_HAN'); }
  cache.put('phien_' + phien, ten, CAU_HINH.THOI_GIAN_PHIEN_GIAY); // gia hạn khi còn dùng
  var quanTri = tk.vaiTro === 'Quản trị';
  return { ten: tk.ten, hoTen: tk.hoTen, quanTri: quanTri, lop: quanTri || tk.lop === '*' ? '*' : tachNhom_(tk.lop), coPhien: true };
}

function dsTaiKhoan_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_TAI_KHOAN);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COT_TK.length).getDisplayValues().map(function (r, i) {
    return { dong: i + 2, ten: r[0].trim(), hoTen: r[1].trim(), vaiTro: r[2].trim() || 'Giáo viên', lop: r[3].trim(),
      bam: r[4].trim(), muoi: r[5].trim(), trangThai: r[6].trim() || 'Hoạt động', ngayTao: r[7].trim() };
  }).filter(function (x) { return x.ten; });
}

function chuanHoaTenDN_(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

/** SHA-256 lặp nhiều lần với muối riêng cho từng tài khoản. */
function bamMatKhau_(matKhau, muoi) {
  var hex = function (b) { return b.map(function (x) { return ('0' + ((x + 256) % 256).toString(16)).slice(-2); }).join(''); };
  var h = muoi + '|' + matKhau;
  for (var i = 0; i < 300; i++) h = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + muoi));
  return h;
}

function taoMatKhauTam_() {
  var m = taoMaNgauNhien_().toLowerCase();
  return m.slice(0, 4) + '-' + m.slice(4);
}

/* ---------- Quản trị tài khoản giáo viên ---------- */

/**
 * Tạo / sửa tài khoản. tk = { ten, hoTen, vaiTro: 'Giáo viên'|'Quản trị', lop: ['Toán 2', ...] | '*', trangThai, matKhau? }
 * Tạo mới mà không có matKhau -> sinh mật khẩu tạm, trả về 1 lần duy nhất trong kq.matKhauTam.
 */
function gvLuuTaiKhoan(tk) {
  yeuCauQuanTri_();
  tk = tk || {};
  var ten = chuanHoaTenDN_(tk.ten);
  if (!/^[a-z0-9._-]{3,30}$/.test(ten)) throw new Error('Tên đăng nhập 3–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang.');
  var hoTen = chuoi_(tk.hoTen);
  if (!hoTen) throw new Error('Vui lòng nhập họ tên giáo viên.');
  var vaiTro = tk.vaiTro === 'Quản trị' ? 'Quản trị' : 'Giáo viên';
  var lop = tk.lop === '*' ? '*' : noiNhom_(tk.lop || []);
  var trangThai = tk.trangThai === 'Khóa' ? 'Khóa' : 'Hoạt động';
  if (tk.matKhau && String(tk.matKhau).length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự.');
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    khoiTao_(ss);
    var sh = ss.getSheetByName(CAU_HINH.SHEET_TAI_KHOAN);
    var cu = dsTaiKhoan_(ss).filter(function (x) { return x.ten === ten; })[0];
    var matKhauTam = '';
    if (cu && !tk.sua) throw new Error('Đã có tài khoản "' + ten + '".');
    if (cu) {
      sh.getRange(cu.dong, 2, 1, 3).setValues([[hoTen, vaiTro, lop]]);
      sh.getRange(cu.dong, 7).setValue(trangThai);
      if (tk.matKhau) { var muoi1 = taoMaNgauNhien_(); sh.getRange(cu.dong, 5, 1, 2).setValues([[bamMatKhau_(String(tk.matKhau), muoi1), muoi1]]); }
    } else {
      matKhauTam = tk.matKhau ? '' : taoMatKhauTam_();
      var muoi = taoMaNgauNhien_();
      sh.getRange(sh.getLastRow() + 1, 1, 1, COT_TK.length).setValues([[ten, hoTen, vaiTro, lop,
        bamMatKhau_(String(tk.matKhau || matKhauTam), muoi), muoi, trangThai, Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')]]);
    }
    var kq = gvTaiDuLieu();
    kq.thongBao = cu ? 'Đã lưu tài khoản ' + ten + '.' : 'Đã tạo tài khoản ' + ten + '.';
    if (matKhauTam) kq.matKhauTam = { ten: ten, hoTen: hoTen, matKhau: matKhauTam };
    return kq;
  });
}

function gvDatLaiMatKhau(ten) {
  yeuCauQuanTri_();
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var tk = dsTaiKhoan_(ss).filter(function (x) { return x.ten === chuanHoaTenDN_(ten); })[0];
    if (!tk) throw new Error('Không tìm thấy tài khoản.');
    var mk = taoMatKhauTam_(), muoi = taoMaNgauNhien_();
    ss.getSheetByName(CAU_HINH.SHEET_TAI_KHOAN).getRange(tk.dong, 5, 1, 2).setValues([[bamMatKhau_(mk, muoi), muoi]]);
    var kq = gvTaiDuLieu();
    kq.matKhauTam = { ten: tk.ten, hoTen: tk.hoTen, matKhau: mk };
    return kq;
  });
}

function gvXoaTaiKhoan(ten) {
  var nd = yeuCauQuanTri_();
  if (nd.coPhien && nd.ten === chuanHoaTenDN_(ten)) throw new Error('Không thể tự xóa tài khoản đang đăng nhập.');
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var tk = dsTaiKhoan_(ss).filter(function (x) { return x.ten === chuanHoaTenDN_(ten); })[0];
    if (tk) ss.getSheetByName(CAU_HINH.SHEET_TAI_KHOAN).deleteRow(tk.dong);
    return gvTaiDuLieu();
  });
}

/** Giáo viên tự đổi mật khẩu (cần mật khẩu cũ). */
function gvDoiMatKhau(cu, moi) {
  var nd = yeuCauGiaoVien_();
  if (!nd.coPhien) throw new Error('Chỉ dùng cho tài khoản giáo viên đăng nhập trên web.');
  if (!moi || String(moi).length < 6) throw new Error('Mật khẩu mới tối thiểu 6 ký tự.');
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var tk = dsTaiKhoan_(ss).filter(function (x) { return x.ten === nd.ten; })[0];
    if (!tk || bamMatKhau_(String(cu), tk.muoi) !== tk.bam) throw new Error('Mật khẩu hiện tại không đúng.');
    var muoi = taoMaNgauNhien_();
    ss.getSheetByName(CAU_HINH.SHEET_TAI_KHOAN).getRange(tk.dong, 5, 1, 2).setValues([[bamMatKhau_(String(moi), muoi), muoi]]);
    return { ok: true };
  });
}

/** Thêm lớp vào danh sách phụ trách của giáo viên đang đăng nhập (khi giáo viên tự tạo lớp). */
function themLopChoTaiKhoan_(ss, ten, nhom) {
  var tk = dsTaiKhoan_(ss).filter(function (x) { return x.ten === ten; })[0];
  if (!tk || tk.lop === '*') return;
  ss.getSheetByName(CAU_HINH.SHEET_TAI_KHOAN).getRange(tk.dong, 4).setValue(noiNhom_(tachNhom_(tk.lop).concat([nhom])));
}

function gvTaiDuLieu() {
  var nd = yeuCauGiaoVien_();
  var ss = laySpreadsheet_();
  khoiTao_(ss);
  var phieu = dsPhieu_(ss);
  var demPhieu = {};
  phieu.forEach(function (p) { demPhieu[p.maDot] = (demPhieu[p.maDot] || 0) + 1; });
  var linkMacDinh = '';
  try { linkMacDinh = ScriptApp.getService().getUrl() || ''; } catch (e) { /* chưa triển khai */ }
  var cd = layCaiDat_();
  var hocSinh = dsHocSinh_(ss).filter(duocHocSinh_).map(function (h) {
    delete h.dong;
    if (nd.lop !== '*') { h.nhomKhac = h.nhom.filter(function (n) { return !duocLop_(n); }).length; h.nhom = h.nhom.filter(duocLop_); h.lop = noiNhom_(h.nhom); }
    return h;
  });
  var dot = dsDot_(ss).map(function (d) {
    return { maDot: d.maDot, baiThi: d.baiThi, lan: d.lan, nhom: d.nhom, ngayThi: d.ngayThi, thuTu: d.thuTu, ngayTao: d.ngayTao,
      soPhieu: demPhieu[d.maDot] || 0, congBo: d.congBo, thuMuc: d.thuMuc };
  });
  dot = dot.filter(function (d) { return duocLop_(d.nhom); });
  var dotDuoc = {};
  dot.forEach(function (d) { dotDuoc[d.maDot] = true; if (!nd.quanTri) d.thuMuc = ''; }); // giáo viên không mở được Drive của trung tâm
  var nhom = {};
  dsNhom_(ss).forEach(function (n) { nhom[n] = true; });
  dsHocSinh_(ss).forEach(function (h) { h.nhom.forEach(function (n) { nhom[n] = true; }); });
  dsDot_(ss).forEach(function (d) { if (d.nhom) nhom[d.nhom] = true; });
  if (nd.lop !== '*') nd.lop.forEach(function (n) { nhom[n] = true; });
  var link = cd.linkTraCuu || linkMacDinh;
  return {
    toi: { ten: nd.ten, hoTen: nd.hoTen, quanTri: !!nd.quanTri, coPhien: !!nd.coPhien, lop: nd.lop },
    hocSinh: hocSinh,
    dot: dot,
    // Điểm gọn để vẽ bảng tổng hợp: [maDot, maHs, tổng điểm, điểm tối đa]
    diem: phieu.filter(function (p) { return dotDuoc[p.maDot]; }).map(function (p) { return [p.maDot, p.maHs, p.tongDiem, p.diemToiDa]; }),
    nhom: Object.keys(nhom).filter(duocLop_).sort(),
    tatCaNhom: nd.quanTri ? Object.keys(nhom).sort() : [],
    taiKhoan: nd.quanTri ? dsTaiKhoan_(ss).map(function (x) { return { ten: x.ten, hoTen: x.hoTen, vaiTro: x.vaiTro, lop: x.lop === '*' ? '*' : tachNhom_(x.lop), trangThai: x.trangThai, ngayTao: x.ngayTao }; }) : [],
    caiDat: nd.quanTri ? cd : { tenTrungTam: cd.tenTrungTam || '' },
    linkTraCuu: link,
    linkGiaoVien: link ? link + '?gv' : ''
  };
}

function gvLuuCaiDat(cd) {
  yeuCauQuanTri_();
  var cu = layCaiDat_();
  ['linkTraCuu', 'tenTrungTam', 'khauHieu', 'logo', 'tieuDeTraCuu'].forEach(function (k) {
    if (cd && cd[k] !== undefined) cu[k] = String(cd[k]).trim();
  });
  PropertiesService.getScriptProperties().setProperty('CAI_DAT', JSON.stringify(cu));
  return gvTaiDuLieu();
}

function layCaiDat_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('CAI_DAT') || '{}'); }
  catch (e) { return {}; }
}

/* =====================================================================
 * 4. GIÁO VIÊN — QUẢN LÝ HỌC SINH
 * ===================================================================== */

function gvLuuHocSinh(hs) {
  yeuCauGiaoVien_();
  var hoTen = String(hs && hs.hoTen || '').trim().replace(/\s+/g, ' ');
  if (!hoTen) throw new Error('Vui lòng nhập họ tên học sinh.');
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    khoiTao_(ss);
    var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
    var ds = dsHocSinh_(ss);
    var nhomGui = tachNhom_(hs.lop);
    nhomGui.forEach(kiemTraLop_);
    var cu = hs.maHs ? ds.filter(function (h) { return h.maHs === hs.maHs; })[0] : null;
    if (hs.maHs && (!cu || !duocHocSinh_(cu))) throw new Error('Không tìm thấy học sinh ' + hs.maHs + '.');
    if (!hs.maHs && !nhomGui.length && nguoiDung_().lop !== '*') throw new Error('Vui lòng chọn lớp cho học sinh.');
    // giáo viên chỉ sửa các lớp mình phụ trách; lớp khác của học sinh giữ nguyên
    var nhomGiuLai = cu ? cu.nhom.filter(function (n) { return !duocLop_(n); }) : [];
    var duLieu = [hoTen, noiNhom_(nhomGiuLai.concat(nhomGui)), chuoi_(hs.ngaySinh), chuoi_(hs.sdt), chuoi_(hs.ghiChu)];
    if (cu) {
      sh.getRange(cu.dong, 2, 1, 5).setValues([duLieu]);
    } else {
      themHocSinhVaoSheet_(sh, ds, [duLieu]);
    }
    return gvTaiDuLieu();
  });
}

/**
 * Thêm nhiều học sinh từ bảng 2 chiều (dán từ Excel hoặc đọc file Excel).
 * Một học sinh có thể học nhiều nhóm/môn, nên khi trùng họ tên với học sinh đã có:
 *   - đã ở cùng nhóm               -> bỏ qua
 *   - trùng SĐT phụ huynh (1 em)    -> coi là cùng một em, thêm nhóm mới cho em đó
 *   - còn lại                       -> KHÔNG tự đoán: trả về danh sách cần giáo viên xác nhận
 * quyetDinh = { số dòng: 'moi' | 'boqua' | Mã HS } là câu trả lời của giáo viên cho các dòng cần xác nhận.
 */
function gvThemNhieuHocSinh(bang, quyetDinh, nhomMacDinh) {
  yeuCauGiaoVien_();
  quyetDinh = quyetDinh || {};
  bang = (bang || []).map(function (r) { return (r || []).map(chuoi_); });
  // Tìm dòng tiêu đề; nếu không có thì coi cột 1 = Họ tên, 2 = Nhóm/lớp, 3 = SĐT phụ huynh, 4 = Ngày sinh
  var c = { ten: 0, lop: 1, sdt: 2, ngaySinh: 3, ghiChu: -1 }, batDau = 0;
  for (var i = 0; i < Math.min(15, bang.length); i++) {
    var k = bang[i].map(khongDau_);
    var cTen = timChiSo_(k, ['hoten', 'hovaten', 'tenhocsinh', 'hotenhocsinh']);
    if (cTen >= 0) {
      c = { ten: cTen, lop: timChiSo_(k, ['nhomlop', 'nhom', 'lop', 'loptoan', 'lophoc']), sdt: timChiSo_(k, ['sdtphuhuynh', 'sdt', 'sodienthoai', 'dienthoai', 'sdtph']),
        ngaySinh: timChiSo_(k, ['ngaysinh']), ghiChu: timChiSo_(k, ['ghichu']) };
      batDau = i + 1;
      break;
    }
  }
  var o = function (r, j) { return j >= 0 ? (r[j] || '').trim() : ''; };
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    khoiTao_(ss);
    var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
    var ds = dsHocSinh_(ss);
    var them = [], gop = 0, boQua = 0, canXacNhan = [], capNhat = [];
    bang.slice(batDau).forEach(function (r, j) {
      var dong = batDau + j;
      var ten = o(r, c.ten).replace(/\s+/g, ' ');
      if (!ten) return;
      var nhom = tachNhom_(o(r, c.lop)), sdt = o(r, c.sdt);
      if (!nhom.length && nhomMacDinh) nhom = [chuoi_(nhomMacDinh)];
      if (!nhom.length && nguoiDung_().lop !== '*') throw new Error('Dòng "' + ten + '" chưa có lớp. Hãy chọn lớp trước khi thêm.');
      nhom.forEach(kiemTraLop_);
      var moi = [ten, noiNhom_(nhom), o(r, c.ngaySinh), sdt, o(r, c.ghiChu)];
      var cung = ds.filter(function (h) { return khongDau_(h.hoTen) === khongDau_(ten); })
        .concat(them.filter(function (d) { return khongDau_(d[0]) === khongDau_(ten); }).map(function (d) { return { moiThem: d, hoTen: d[0], nhom: tachNhom_(d[1]), sdt: d[3] }; }));
      var qd = quyetDinh[dong];
      var chon = null;
      if (qd === 'boqua') { boQua++; return; }
      if (qd === 'moi' || !cung.length) { them.push(moi); return; }
      if (qd) chon = ds.filter(function (h) { return h.maHs === qd; })[0];
      if (!chon && nhom.length && cung.some(function (h) { return nhom.every(function (n) { return thuocNhom_(h, n); }); })) { boQua++; return; }
      if (!chon && sdt) {
        var theoSdt = cung.filter(function (h) { return chuanHoaSdt_(h.sdt) && chuanHoaSdt_(h.sdt) === chuanHoaSdt_(sdt); });
        if (theoSdt.length === 1) chon = theoSdt[0];
      }
      if (!chon) {
        canXacNhan.push({ dong: dong, hoTen: ten, nhom: noiNhom_(nhom), sdt: sdt,
          ungVien: cung.filter(function (h) { return h.maHs; }).map(function (h) { return { maHs: h.maHs, hoTen: h.hoTen, nhom: noiNhom_(h.nhom), sdt: duocHocSinh_(h) ? h.sdt : '' }; }) });
        return;
      }
      // cùng một em -> thêm nhóm mới cho em đó
      if (chon.moiThem) { chon.moiThem[1] = noiNhom_(tachNhom_(chon.moiThem[1]).concat(nhom)); gop++; return; }
      capNhat.push({ hs: chon, nhom: nhom });
      gop++;
    });
    if (canXacNhan.length) return { canXacNhan: canXacNhan };
    capNhat.forEach(function (x) { x.nhom.forEach(function (n) { themNhomChoHs_(sh, x.hs, n); }); });
    themHocSinhVaoSheet_(sh, ds, them);
    var kq = gvTaiDuLieu();
    kq.thongBao = 'Đã thêm ' + them.length + ' học sinh mới' + (gop ? ', thêm nhóm cho ' + gop + ' em đã có' : '') +
      (boQua ? ', bỏ qua ' + boQua + ' em đã có trong nhóm' : '') + '.';
    return kq;
  });
}

function gvXoaHocSinh(maHs) {
  yeuCauGiaoVien_();
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var hs = dsHocSinh_(ss).filter(function (h) { return h.maHs === maHs; })[0];
    if (!hs || !duocHocSinh_(hs)) throw new Error('Không tìm thấy học sinh.');
    var conLai = hs.nhom.filter(function (n) { return !duocLop_(n); });
    var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
    // em còn học lớp khác (giáo viên khác phụ trách) -> chỉ bỏ khỏi lớp của mình, giữ mã tra cứu
    if (conLai.length) sh.getRange(hs.dong, 3).setValue(noiNhom_(conLai));
    else sh.deleteRow(hs.dong);
    return gvTaiDuLieu();
  });
}

function gvCapLaiMa(maHs) {
  yeuCauGiaoVien_();
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var ds = dsHocSinh_(ss);
    var hs = ds.filter(function (h) { return h.maHs === maHs; })[0];
    if (!hs || !duocHocSinh_(hs)) throw new Error('Không tìm thấy học sinh.');
    var daDung = {};
    ds.forEach(function (h) { daDung[chuanHoaMa_(h.maTraCuu)] = true; });
    ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH).getRange(hs.dong, 7).setValue(hienThiMa_(taoMaKhongTrung_(daDung)));
    return gvTaiDuLieu();
  });
}

/**
 * Cập nhật nhóm cho nhiều học sinh.
 * hanhDong: 'them' (thêm vào nhóm, giữ nhóm cũ) | 'bo' (bỏ khỏi nhóm) | 'chuyen' (chỉ còn nhóm này)
 */
function gvCapNhatNhom(dsMaHs, nhom, hanhDong) {
  yeuCauGiaoVien_();
  nhom = chuoi_(nhom);
  if (!nhom) throw new Error('Vui lòng nhập tên nhóm.');
  kiemTraLop_(nhom);
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
    var can = {};
    (dsMaHs || []).forEach(function (m) { can[m] = true; });
    var so = 0;
    dsHocSinh_(ss).forEach(function (h) {
      if (!can[h.maHs] || !duocHocSinh_(h)) return;
      var ds = hanhDong === 'chuyen' ? h.nhom.filter(function (n) { return !duocLop_(n); }).concat([nhom])
        : hanhDong === 'bo' ? h.nhom.filter(function (n) { return khongDau_(n) !== khongDau_(nhom); })
        : h.nhom.concat([nhom]);
      sh.getRange(h.dong, 3).setValue(noiNhom_(ds));
      so++;
    });
    var kq = gvTaiDuLieu();
    kq.thongBao = (hanhDong === 'bo' ? 'Đã bỏ ' + so + ' học sinh khỏi' : hanhDong === 'chuyen' ? 'Đã chuyển ' + so + ' học sinh sang' : 'Đã thêm ' + so + ' học sinh vào') + ' nhóm "' + nhom + '".';
    return kq;
  });
}

/** Đổi tên nhóm: cập nhật cả học sinh và các bài thi của nhóm. */
function gvDoiTenNhom(cu, moi) {
  yeuCauGiaoVien_();
  cu = chuoi_(cu); moi = chuoi_(moi).replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cu || !moi) throw new Error('Thiếu tên nhóm.');
  kiemTraLop_(cu);
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var shTk = ss.getSheetByName(CAU_HINH.SHEET_TAI_KHOAN);
    dsTaiKhoan_(ss).forEach(function (x) {
      if (x.lop !== '*' && tachNhom_(x.lop).some(function (n) { return khongDau_(n) === khongDau_(cu); })) {
        shTk.getRange(x.dong, 4).setValue(noiNhom_(tachNhom_(x.lop).map(function (n) { return khongDau_(n) === khongDau_(cu) ? moi : n; })));
      }
    });
    if (PHIEN_ && PHIEN_.lop !== '*') PHIEN_.lop = PHIEN_.lop.map(function (n) { return khongDau_(n) === khongDau_(cu) ? moi : n; });
    var shHs = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH), shDot = ss.getSheetByName(CAU_HINH.SHEET_DOT);
    dsHocSinh_(ss).forEach(function (h) {
      if (thuocNhom_(h, cu)) shHs.getRange(h.dong, 3).setValue(noiNhom_(h.nhom.map(function (n) { return khongDau_(n) === khongDau_(cu) ? moi : n; })));
    });
    dsDot_(ss).forEach(function (d) { if (d.nhom === cu) shDot.getRange(d.dong, CD.NHOM).setValue(moi); });
    var shN = ss.getSheetByName(CAU_HINH.SHEET_NHOM);
    dsNhom_(ss).forEach(function (n, i) { if (khongDau_(n) === khongDau_(cu)) shN.getRange(i + 2, 1).setValue(moi); });
    var kq = gvTaiDuLieu();
    kq.thongBao = 'Đã đổi tên nhóm "' + cu + '" thành "' + moi + '".';
    return kq;
  });
}

/** Tạo lớp/nhóm mới (chưa cần có học sinh). */
function gvTaoNhom(ten) {
  yeuCauGiaoVien_();
  ten = chuoi_(ten).replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!ten) throw new Error('Vui lòng nhập tên lớp/nhóm.');
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    khoiTao_(ss);
    var tatCa = {};
    dsNhom_(ss).forEach(function (n) { tatCa[khongDau_(n)] = true; });
    dsHocSinh_(ss).forEach(function (h) { h.nhom.forEach(function (n) { tatCa[khongDau_(n)] = true; }); });
    dsDot_(ss).forEach(function (d) { tatCa[khongDau_(d.nhom)] = true; });
    if (tatCa[khongDau_(ten)]) throw new Error('Đã có lớp/nhóm "' + ten + '"' + (duocLop_(ten) ? '.' : ' (do giáo viên khác phụ trách — nhờ quản trị thêm lớp này cho bạn).'));
    var sh = ss.getSheetByName(CAU_HINH.SHEET_NHOM);
    sh.getRange(sh.getLastRow() + 1, 1, 1, COT_NHOM.length).setValues([[ten, '', Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')]]);
    var nd = nguoiDung_();
    if (nd.coPhien && nd.lop !== '*') { themLopChoTaiKhoan_(ss, nd.ten, ten); nd.lop = nd.lop.concat([ten]); }
    var kq = gvTaiDuLieu();
    kq.thongBao = 'Đã tạo lớp/nhóm "' + ten + '".';
    kq.nhomMoi = ten;
    return kq;
  });
}

function themNhomChoHs_(sh, hs, nhom) {
  if (!nhom || thuocNhom_(hs, nhom)) return;
  hs.nhom = hs.nhom.concat([nhom]);
  hs.lop = noiNhom_(hs.nhom);
  sh.getRange(hs.dong, 3).setValue(hs.lop);
}

/** Ghi các dòng [hoTen, lop, ngaySinh, sdt, ghiChu] vào tab HocSinh, tự sinh Mã HS + mã tra cứu. Trả về Mã HS mới. */
function themHocSinhVaoSheet_(sh, ds, dong) {
  if (!dong.length) return [];
  var soLonNhat = 0, daDung = {};
  ds.forEach(function (h) {
    var m = /(\d+)$/.exec(h.maHs);
    if (m) soLonNhat = Math.max(soLonNhat, Number(m[1]));
    daDung[chuanHoaMa_(h.maTraCuu)] = true;
  });
  var homNay = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
  var moi = dong.map(function (d) {
    var maHs = d.maHs || ('HS' + ('0000' + (++soLonNhat)).slice(-4));
    return [maHs, d[0], d[1], d[2], d[3], d[4], hienThiMa_(taoMaKhongTrung_(daDung)), homNay];
  });
  sh.getRange(sh.getLastRow() + 1, 1, moi.length, COT_HS.length).setNumberFormat('@').setValues(moi);
  return moi.map(function (r) { return r[0]; });
}

/* =====================================================================
 * 5. GIÁO VIÊN — GỬI KẾT QUẢ THI
 *    Dữ liệu file (Excel/Google Sheet) được chuyển thành "sổ": { tênTab: [[ô, ô, ...], ...] }
 * ===================================================================== */

/** Đọc 1 link Google Sheet thành "sổ" để xử lý giống file Excel. */
function gvDocLinkSheet(url) {
  var nd = yeuCauGiaoVien_();
  var nguon;
  try { nguon = SpreadsheetApp.openByUrl(String(url).trim()); }
  catch (e) { throw new Error('Không mở được link. Kiểm tra lại link và quyền truy cập của bạn với file đó.'); }
  if (!nd.quanTri) {
    // Hệ thống chạy bằng tài khoản trung tâm: chỉ đọc file mà giáo viên đã chia sẻ công khai bằng link,
    // để giáo viên không thể đọc các file riêng khác trong Drive của trung tâm.
    var truyCap = DriveApp.getFileById(nguon.getId()).getSharingAccess();
    if (truyCap !== DriveApp.Access.ANYONE && truyCap !== DriveApp.Access.ANYONE_WITH_LINK) {
      throw new Error('Hãy chia sẻ file Google Sheet ở chế độ "Bất kỳ ai có đường liên kết" (chỉ xem), hoặc tải file Excel lên.');
    }
  }
  var so = {};
  nguon.getSheets().forEach(function (s) {
    so[s.getName()] = s.getLastRow() ? s.getDataRange().getDisplayValues() : [];
  });
  return so;
}

/**
 * Bước 1 (đã chọn lớp): đọc + chấm thử, ghép với danh sách học sinh của lớp, kèm HTML xem trước phiếu đầu tiên.
 * Trạng thái mỗi dòng: co | moi | boqua | canChon (giáo viên phải chọn) | loi
 */
function gvXemTruoc(so, nhom, quyetDinh, tuThemMoi) {
  yeuCauGiaoVien_();
  nhom = chuoi_(nhom);
  if (!nhom) throw new Error('Vui lòng chọn lớp/nhóm trước.');
  kiemTraLop_(nhom);
  var ss = laySpreadsheet_();
  khoiTao_(ss);
  var kq = phanTichFile_(so);
  if (!kq.ok) return kq;
  var g = ghepTheoLop_(kq.hocSinh, dsHocSinh_(ss), nhom, quyetDinh, tuThemMoi !== false);
  var gon = function (x) { return { maHs: x.maHs, hoTen: x.hoTen, nhom: noiNhom_(x.nhom), sdt: duocHocSinh_(x) ? x.sdt : '' }; };
  var dauTien = null;
  var dsXem = kq.hocSinh.map(function (h, i) {
    var r = g.dong[i];
    var cham = chamBai_(kq, h);
    if (!dauTien && (r.hs || r.moi)) dauTien = { h: h, cham: cham, hs: r.hs || { hoTen: h.hoTen } };
    return { chiSo: i, stt: h.stt, hoTen: h.hoTen, maHsFile: h.maHs, maDe: h.maDe, tongDiem: cham.diem.tong, maxTong: cham.diem.maxTong,
      trangThai: r.loi ? 'loi' : r.canChon ? 'canChon' : r.boQua ? 'boqua' : r.moi ? 'moi' : 'co',
      loi: r.loi || '', lyDo: r.canChon ? LY_DO_CAN_CHON[r.canChon] : '', canChon: r.canChon || '', tuDong: !!r.tuDong,
      hs: r.hs ? gon(r.hs) : null, themVaoLop: !!r.themVaoLop, daChon: !!(quyetDinh || {})[i],
      ungVien: (r.ungVien || []).map(gon) };
  });
  return {
    ok: true,
    nhom: nhom,
    tieuDe: kq.thongTin.tieuDe,
    ngayThi: kq.thongTin.ngayThi,
    soCau: { I: kq.cauHoi.I.length, II: kq.cauHoi.II.length, III: kq.cauHoi.III.length },
    canhBao: kq.canhBao,
    hocSinh: dsXem,
    siSo: g.siSo,
    vang: g.vang.map(gon),
    htmlXemTruoc: dauTien ? taoHtmlPhieu_(kq, dauTien.h, dauTien.cham, dauTien.hs, '(xem trước)', layLogo_(),
      { lan: 1, ngayThi: kq.thongTin.ngayThi, lichSu: [], nhom: nhom }) : ''
  };
}

/**
 * Bước 2: tạo 1 lần thi.
 * tuyChon = { baiThi, nhom, ngayThi (dd/MM/yyyy), themHsMoi, ghiDe, quyetDinh: { chỉ số dòng: Mã HS | 'moi' | 'boqua' } }
 *   - Bài thi chưa có trong nhóm -> Lần 1.
 *   - Đã có -> Lần tiếp theo (giữ nguyên các lần trước), hoặc ghi đè lần gần nhất nếu ghiDe = true.
 *   - Học sinh có phiếu được tự thêm vào nhóm (1 em có thể thuộc nhiều nhóm).
 * Trả về canTao = [{ i: chỉ số dòng, maHs }] để tạo phiếu theo lô.
 */
function gvBatDauDot(so, tuyChon) {
  yeuCauGiaoVien_();
  tuyChon = tuyChon || {};
  var baiThi = chuoi_(tuyChon.baiThi).replace(/\s+/g, ' ');
  var nhom = chuoi_(tuyChon.nhom);
  var ngayThi = chuanHoaNgay_(tuyChon.ngayThi) || Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
  if (!baiThi) throw new Error('Vui lòng nhập tên bài thi.');
  if (!nhom) throw new Error('Vui lòng chọn nhóm học sinh.');
  kiemTraLop_(nhom);
  var kq = phanTichFile_(so);
  if (!kq.ok) return kq;
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    khoiTao_(ss);
    var shHs = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
    var g = ghepTheoLop_(kq.hocSinh, dsHocSinh_(ss), nhom, tuyChon.quyetDinh, tuyChon.themHsMoi !== false);
    var ghep = g.dong;
    var conChon = ghep.filter(function (x) { return x.canChon; }).length;
    if (conChon) return { ok: false, loi: 'Còn ' + conChon + ' dòng chưa xác định học sinh (xem cột Trạng thái).' };

    var cacLan = dsDot_(ss).filter(function (d) { return khongDau_(d.nhom) === khongDau_(nhom) && khongDau_(d.baiThi) === khongDau_(baiThi); });
    var lan = 1;
    if (cacLan.length) {
      var ganNhat = cacLan.reduce(function (a, b) { return b.lan > a.lan ? b : a; });
      baiThi = ganNhat.baiThi; nhom = ganNhat.nhom; // giữ đúng cách viết đã có
      if (tuyChon.ghiDe) { lan = ganNhat.lan; xoaDot_(ss, ganNhat.maDot); }
      else lan = ganNhat.lan + 1;
    }

    // Học sinh mới -> tạo (thuộc nhóm này); học sinh đã có -> thêm nhóm này nếu chưa có
    var maTheoDong = {};
    var dongMoi = [], chiSoMoi = [];
    kq.hocSinh.forEach(function (h, i) {
      var x = ghep[i];
      if (x.hs) { themNhomChoHs_(shHs, x.hs, nhom); maTheoDong[i] = x.hs.maHs; }
      else if (x.moi) {
        var d = [h.hoTen, nhom, '', h.sdt || '', ''];
        if (h.maHs) d.maHs = h.maHs;
        dongMoi.push(d); chiSoMoi.push(i);
      }
    });
    themHocSinhVaoSheet_(shHs, dsHocSinh_(ss), dongMoi).forEach(function (ma, j) { maTheoDong[chiSoMoi[j]] = ma; });

    var maDot = 'D' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyMMddHHmmss') + taoMaNgauNhien_().slice(0, 3);
    var thuMuc = layThuMucGoc_().createFolder(nhom + ' - ' + baiThi + ' - Lần ' + lan + ' (' + maDot + ')');
    var shDot = ss.getSheetByName(CAU_HINH.SHEET_DOT);
    shDot.getRange(shDot.getLastRow() + 1, 1, 1, COT_DOT.length).setNumberFormat('@')
      .setValues([[maDot, baiThi, String(lan), nhom, ngayThi, Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy'), '0', 'FALSE', thuMuc.getUrl()]]);

    var canTao = [], boQua = [];
    kq.hocSinh.forEach(function (h, i) {
      if (maTheoDong[i]) canTao.push({ i: i, maHs: maTheoDong[i] });
      else boQua.push((h.hoTen || h.maHs) + ': ' + (ghep[i].loi || 'bỏ qua'));
    });
    return { ok: true, maDot: maDot, baiThi: baiThi, lan: lan, nhom: nhom, canTao: canTao, boQua: boQua, thuMuc: nguoiDung_().quanTri ? thuMuc.getUrl() : '',
      vang: g.vang.map(function (x) { return x.hoTen + ' (' + x.maHs + ')'; }) };
  });
}

/** Bước 3: tạo phiếu PDF cho 1 lô học sinh (gọi nhiều lần để tránh giới hạn 6 phút). */
function gvTaoPhieuLo(maDot, so, dsGhep) {
  yeuCauGiaoVien_();
  var ss = laySpreadsheet_();
  var dsD = dsDot_(ss);
  var dot = dsD.filter(function (d) { return d.maDot === maDot; })[0];
  if (!dot) throw new Error('Không tìm thấy lần thi.');
  kiemTraLop_(dot.nhom);
  var kq = phanTichFile_(so);
  if (!kq.ok) throw new Error(kq.loi);
  var theoMa = {};
  dsHocSinh_(ss).forEach(function (x) { theoMa[x.maHs] = x; });
  var thuMuc = DriveApp.getFolderById(layIdTuLink_(dot.thuMuc));
  var logo = layLogo_();

  // Các lần trước của cùng bài thi, cùng nhóm -> để in "so với lần trước"
  var lanTruoc = {};
  dsD.forEach(function (d) {
    if (d.maDot !== maDot && d.lan < dot.lan && khongDau_(d.baiThi) === khongDau_(dot.baiThi) && khongDau_(d.nhom) === khongDau_(dot.nhom)) lanTruoc[d.maDot] = d;
  });
  var phieuTruoc = dsPhieu_(ss).filter(function (p) { return lanTruoc[p.maDot]; });

  var dongMoi = [], loi = [];
  (dsGhep || []).forEach(function (x) {
    var h = kq.hocSinh[x.i], g = { hs: theoMa[x.maHs] };
    if (!h || !g.hs) { loi.push((h && h.hoTen) + ': chưa có trong danh sách học sinh'); return; }
    try {
      var cham = chamBai_(kq, h);
      var maPhieu = maDot + '-' + g.hs.maHs;
      var lichSu = phieuTruoc.filter(function (p) { return p.maHs === g.hs.maHs; })
        .map(function (p) { return { lan: lanTruoc[p.maDot].lan, ngayThi: lanTruoc[p.maDot].ngayThi, tong: p.tongDiem }; })
        .sort(function (a, b) { return a.lan - b.lan; });
      var html = taoHtmlPhieu_(kq, h, cham, g.hs, maPhieu, logo, { lan: dot.lan, ngayThi: dot.ngayThi, lichSu: lichSu, nhom: dot.nhom });
      var ten = dot.baiThi + ' - Lần ' + dot.lan + ' - ' + g.hs.hoTen + ' - ' + g.hs.maHs;
      var pdf = thuMuc.createFile(Utilities.newBlob(html, MimeType.HTML, ten + '.html').getAs(MimeType.PDF).setName(ten + '.pdf'));
      dongMoi.push([maPhieu, maDot, g.hs.maHs, g.hs.hoTen, cham.diem.tong, cham.diem.maxTong, pdf.getId(), new Date()]);
    } catch (e) {
      loi.push(h.hoTen + ': ' + e.message);
    }
  });

  voiKhoa_(function () {
    var sh = ss.getSheetByName(CAU_HINH.SHEET_PHIEU);
    if (dongMoi.length) {
      sh.getRange(sh.getLastRow() + 1, 1, dongMoi.length, COT_PHIEU.length).setValues(dongMoi);
      sh.getRange(sh.getLastRow() - dongMoi.length + 1, 5, dongMoi.length, 2).setNumberFormat('@');
    }
    var tong = dsPhieu_(ss).filter(function (p) { return p.maDot === maDot; }).length;
    ss.getSheetByName(CAU_HINH.SHEET_DOT).getRange(dot.dong, CD.SO_PHIEU).setValue(String(tong));
  });
  return { xong: dongMoi.length, loi: loi };
}

function gvCongBo(maDot, congBo) {
  yeuCauGiaoVien_();
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var d = dsDot_(ss).filter(function (x) { return x.maDot === maDot; })[0];
    if (d) kiemTraLop_(d.nhom);
    if (d) ss.getSheetByName(CAU_HINH.SHEET_DOT).getRange(d.dong, CD.CONG_BO).setValue(congBo ? 'TRUE' : 'FALSE');
    return gvTaiDuLieu();
  });
}

function gvXoaDot(maDot) {
  yeuCauGiaoVien_();
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var d = dsDot_(ss).filter(function (x) { return x.maDot === maDot; })[0];
    if (d) kiemTraLop_(d.nhom);
    xoaDot_(ss, maDot);
    return gvTaiDuLieu();
  });
}

function xoaDot_(ss, maDot) {
  var shP = ss.getSheetByName(CAU_HINH.SHEET_PHIEU);
  var v = shP.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][1]) !== maDot) continue;
    try { DriveApp.getFileById(String(v[i][6])).setTrashed(true); } catch (e) { /* đã xóa */ }
    shP.deleteRow(i + 1);
  }
  var d = dsDot_(ss).filter(function (x) { return x.maDot === maDot; })[0];
  if (d) {
    try { DriveApp.getFolderById(layIdTuLink_(d.thuMuc)).setTrashed(true); } catch (e) { /* đã xóa */ }
    ss.getSheetByName(CAU_HINH.SHEET_DOT).deleteRow(d.dong);
  }
}

/** Dữ liệu file mẫu kết quả thi; nếu có lớp thì tab KetQua điền sẵn STT, Mã HS, Họ tên của học sinh trong lớp. */
function gvLayMauLop(nhom) {
  yeuCauGiaoVien_();
  var mau = JSON.parse(JSON.stringify(MAU_FILE_KET_QUA));
  nhom = chuoi_(nhom);
  if (nhom) kiemTraLop_(nhom);
  if (nhom) {
    var tieuDe = mau.KetQua[0];
    var lop = dsHocSinh_(laySpreadsheet_()).filter(function (h) { return thuocNhom_(h, nhom); })
      .sort(function (a, b) { return a.hoTen.split(' ').pop().localeCompare(b.hoTen.split(' ').pop(), 'vi') || a.hoTen.localeCompare(b.hoTen, 'vi'); });
    if (lop.length) {
      mau.KetQua = [tieuDe].concat(lop.map(function (h, i) {
        var r = tieuDe.map(function () { return ''; });
        r[0] = String(i + 1); r[1] = h.maHs; r[2] = h.hoTen; r[3] = nhom;
        return r;
      }));
    }
  }
  return mau;
}

/** Tạo file mẫu kết quả thi (Google Sheet) trong Drive — giáo viên có thể tải về dạng Excel. */
function gvTaoFileMau(nhom) {
  yeuCauQuanTri_(); // file tạo trong Drive của trung tâm -> chỉ quản trị mở được
  var mau = gvLayMauLop(nhom);
  var f = SpreadsheetApp.create('Mẫu kết quả thi' + (nhom ? ' - ' + nhom : ''));
  var dau = f.getSheets()[0];
  Object.keys(mau).forEach(function (ten, i) {
    var sh = i === 0 ? dau.setName(ten) : f.insertSheet(ten);
    var v = mau[ten];
    var soCot = Math.max.apply(null, v.map(function (r) { return r.length; }));
    var day = v.map(function (r) { var x = r.slice(); while (x.length < soCot) x.push(''); return x; });
    sh.getRange(1, 1, day.length, soCot).setNumberFormat('@').setValues(day);
    sh.getRange(1, 1, 1, soCot).setFontWeight('bold').setBackground('#e8f0fe');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, day.length, soCot).setWrap(true).setVerticalAlignment('top');
  });
  return f.getUrl();
}

/* =====================================================================
 * 6. ĐỌC FILE KẾT QUẢ
 * ===================================================================== */

/**
 * Đọc "sổ" theo mẫu: tab ThongTin (tùy chọn), DeThi (khuyến nghị), KetQua (bắt buộc).
 * Trả về { ok, loi, thongTin, cauHoi: {I:[], II:[], III:[]}, hocSinh: [...], canhBao: [] }
 */
function phanTichFile_(so) {
  so = so || {};
  var tab = {};
  Object.keys(so).forEach(function (ten) { tab[khongDau_(ten)] = (so[ten] || []).map(function (r) { return (r || []).map(chuoi_); }); });
  var tenTab = Object.keys(tab);
  var ketQua = tab.ketqua || tab.ketquathi || (tenTab.length === 1 ? tab[tenTab[0]] : null);
  if (!ketQua) return { ok: false, loi: 'Không tìm thấy tab "KetQua" trong file. Hãy dùng đúng file mẫu.' };

  var canhBao = [];

  // --- ThongTin ---
  var tt = {};
  (tab.thongtin || []).forEach(function (r) { if (r[0]) tt[khongDau_(r[0])] = (r[1] || '').trim(); });
  var thongTin = {
    tieuDe: tt.tieudephieu || tt.tieude || tt.tenbaithi || 'PHIẾU KẾT QUẢ KIỂM TRA',
    moTa: tt.mota || '',
    ngayThi: chuanHoaNgay_(tt.ngaythi),
    nhanLop: tt.nhanlop || 'Lớp',
    diemCauI: soThuc_(tt.diemmoicauphani, CAU_HINH.DIEM_CAU_PHAN_I),
    diemCauIII: soThuc_(tt.diemmoicauphaniii, CAU_HINH.DIEM_CAU_PHAN_III),
    moTaPhan: { I: tt.motaphani || '', II: tt.motaphanii || '', III: tt.motaphaniii || '' },
    tenPhan: { I: tt.tenphani || 'Câu trắc nghiệm nhiều phương án lựa chọn.', II: tt.tenphanii || 'Câu trắc nghiệm đúng sai.', III: tt.tenphaniii || 'Tự luận' }
  };

  // --- DeThi ---
  var cauHoi = { I: [], II: [], III: [] };
  var deThi = tab.dethi || [];
  var hDe = timDongTieuDe_(deThi, function (k) { return k.indexOf('phan') >= 0 && k.indexOf('cau') >= 0; });
  if (hDe >= 0) {
    var k = deThi[hDe].map(khongDau_);
    var c = {
      phan: k.indexOf('phan'), cau: k.indexOf('cau'),
      chuDe: timChiSo_(k, ['chudekienthuc', 'chude']), mucDo: timChiSo_(k, ['mucdo']),
      noiDung: timChiSo_(k, ['noidungphantichcuthe', 'noidungphantich', 'noidung']),
      dapAn: timChiSo_(k, ['dapandung', 'dapan', 'dapso'])
    };
    var cotMaDe = [];
    k.forEach(function (x, j) { var m = /^dapan(?:made|ma)(.+)$/.exec(x); if (m) cotMaDe.push({ j: j, ma: m[1] }); });
    var o = function (r, j) { return j >= 0 ? String(r[j] == null ? '' : r[j]).trim() : ''; };
    deThi.slice(hDe + 1).forEach(function (r) {
      var phan = chuanHoaPhan_(o(r, c.phan)), cau = parseInt(o(r, c.cau), 10);
      if (!phan || !cau) return;
      var dapAn = { '': o(r, c.dapAn) };
      cotMaDe.forEach(function (x) { if (o(r, x.j)) dapAn[x.ma] = o(r, x.j); });
      cauHoi[phan].push({ cau: cau, chuDe: o(r, c.chuDe), mucDo: o(r, c.mucDo), noiDung: o(r, c.noiDung), dapAn: dapAn });
    });
  } else {
    canhBao.push('Không có tab "DeThi": phiếu sẽ không có chủ đề, nội dung và đáp án đúng.');
  }

  // --- KetQua ---
  var aliasTen = ['hoten', 'hovaten', 'tenhocsinh', 'hotenhocsinh'];
  var hKq = timDongTieuDe_(ketQua, function (k) { return timChiSo_(k, aliasTen) >= 0 || k.indexOf('mahs') >= 0; });
  if (hKq < 0) return { ok: false, loi: 'Tab KetQua cần có cột "Họ và tên" (hoặc "Mã HS").' };
  var hk = ketQua[hKq].map(khongDau_);
  var ck = {
    stt: hk.indexOf('stt'), maHs: timChiSo_(hk, ['mahs', 'mahocsinh']), ten: timChiSo_(hk, aliasTen),
    lop: timChiSo_(hk, ['lop', 'loptoan', 'lophoc']), maDe: timChiSo_(hk, ['made', 'madethi']),
    p1: timChiSo_(hk, ['diemphani', 'diemphan1', 'diemp1']), p2: timChiSo_(hk, ['diemphanii', 'diemphan2', 'diemp2']),
    p3: timChiSo_(hk, ['diemphaniii', 'diemphan3', 'diemp3']), tong: timChiSo_(hk, ['tongdiem', 'diemtong']),
    sdt: timChiSo_(hk, ['sdtphuhuynh', 'sdt', 'sodienthoai', 'sdtph']),
    uu: timChiSo_(hk, ['uudiem']), nhuoc: timChiSo_(hk, ['nhuocdiem']),
    khacPhuc: timChiSo_(hk, ['huongkhacphuc', 'khacphuc']), loiKhuyen: timChiSo_(hk, ['loikhuyen'])
  };
  var cotCau = [];
  ketQua[hKq].forEach(function (h, j) {
    var m = /^(III|II|I)[.\-_ ]*(\d+)$/i.exec(String(h).replace(/\s+/g, '').replace(/^câu/i, ''));
    if (m) cotCau.push({ j: j, phan: m[1].toUpperCase(), cau: parseInt(m[2], 10) });
  });

  // Câu có trong KetQua mà DeThi không có -> thêm câu trống
  cotCau.forEach(function (x) {
    if (!cauHoi[x.phan].some(function (q) { return q.cau === x.cau; })) {
      cauHoi[x.phan].push({ cau: x.cau, chuDe: '', mucDo: '', noiDung: '', dapAn: { '': '' } });
    }
  });
  ['I', 'II', 'III'].forEach(function (p) { cauHoi[p].sort(function (a, b) { return a.cau - b.cau; }); });

  var lay = function (r, j) { return j >= 0 ? String(r[j] == null ? '' : r[j]).trim() : ''; };
  var hocSinh = [];
  ketQua.slice(hKq + 1).forEach(function (r) {
    var ten = lay(r, ck.ten).replace(/\s+/g, ' '), maHs = lay(r, ck.maHs);
    if (!ten && !maHs) return;
    var traLoi = {};
    cotCau.forEach(function (x) { traLoi[x.phan + '.' + x.cau] = lay(r, x.j); });
    hocSinh.push({
      chiSo: hocSinh.length, stt: lay(r, ck.stt), maHs: maHs, hoTen: ten, lop: lay(r, ck.lop), maDe: lay(r, ck.maDe), sdt: lay(r, ck.sdt),
      traLoi: traLoi,
      diemNhap: { p1: lay(r, ck.p1), p2: lay(r, ck.p2), p3: lay(r, ck.p3), tong: lay(r, ck.tong) },
      nhanXet: { uu: lay(r, ck.uu), nhuoc: lay(r, ck.nhuoc), khacPhuc: lay(r, ck.khacPhuc), loiKhuyen: lay(r, ck.loiKhuyen) }
    });
  });
  if (!hocSinh.length) return { ok: false, loi: 'Tab KetQua chưa có học sinh nào.' };

  if (cauHoi.III.length && ck.p3 < 0 && !cotCau.some(function (x) { return x.phan === 'III'; })) {
    canhBao.push('Không có cột "Điểm phần III" và câu trả lời phần III: điểm phần III sẽ là 0.');
  }
  return { ok: true, thongTin: thongTin, cauHoi: cauHoi, hocSinh: hocSinh, canhBao: canhBao };
}

/** Chấm bài 1 học sinh: so đáp án, tính điểm các phần (ưu tiên điểm giáo viên đã nhập). */
function chamBai_(kq, h) {
  var maDe = khongDau_(h.maDe);
  var dapAnCua = function (q) { return (maDe && q.dapAn[maDe]) || q.dapAn[''] || ''; };
  var tt = kq.thongTin;

  var phan1 = kq.cauHoi.I.map(function (q) {
    var hs = h.traLoi['I.' + q.cau] || '', dung = dapAnCua(q);
    return { cau: q.cau, chuDe: q.chuDe, mucDo: q.mucDo, noiDung: q.noiDung, hs: hs, dung: dung,
      ok: !!hs && !!dung && chuanHoaDapAn_(hs) === chuanHoaDapAn_(dung) };
  });

  var bangII = CAU_HINH.DIEM_PHAN_II_THEO_SO_Y_DUNG;
  var diemII = 0;
  var phan2 = kq.cauHoi.II.map(function (q) {
    var hs = h.traLoi['II.' + q.cau] || '', dung = dapAnCua(q);
    var a = chuoiDungSai_(hs), b = chuoiDungSai_(dung), soDung = 0;
    var kyTu = a.split('').map(function (ch, i) {
      var ok = i < b.length && ch === b[i];
      if (ok) soDung++;
      return { c: ch === 'D' ? 'Đ' : 'S', ok: ok };
    });
    diemII += b.length === 4 ? bangII[soDung] : (b.length ? soDung / b.length : 0);
    return { cau: q.cau, chuDe: q.chuDe, mucDo: q.mucDo, noiDung: q.noiDung, hs: hs, kyTu: kyTu, dung: dung, soDung: soDung };
  });

  var phan3 = kq.cauHoi.III.map(function (q) {
    var hs = h.traLoi['III.' + q.cau] || '', dung = dapAnCua(q);
    return { cau: q.cau, chuDe: q.chuDe, mucDo: q.mucDo, noiDung: q.noiDung, hs: hs, dung: dung,
      ok: !!hs && !!dung && chuanHoaDapAn_(hs) === chuanHoaDapAn_(dung) };
  });

  var dn = h.diemNhap;
  var p1 = dn.p1 !== '' ? soThuc_(dn.p1, 0) : phan1.filter(function (x) { return x.ok; }).length * tt.diemCauI;
  var p2 = dn.p2 !== '' ? soThuc_(dn.p2, 0) : diemII;
  var p3 = dn.p3 !== '' ? soThuc_(dn.p3, 0) : phan3.filter(function (x) { return x.ok; }).length * tt.diemCauIII;
  var tong = dn.tong !== '' ? soThuc_(dn.tong, 0) : p1 + p2 + p3;
  var max1 = phan1.length * tt.diemCauI, max2 = phan2.length * 1, max3 = phan3.length * tt.diemCauIII;

  return {
    phan1: phan1, phan2: phan2, phan3: phan3,
    coTraLoiIII: phan3.some(function (x) { return x.hs; }),
    diem: { p1: dinhDangDiem_(p1), p2: dinhDangDiem_(p2), p3: dinhDangDiem_(p3), tong: dinhDangDiem_(tong),
      max1: dinhDangSo_(max1), max2: dinhDangSo_(max2), max3: dinhDangSo_(max3), maxTong: dinhDangSo_(max1 + max2 + max3) }
  };
}

function taoHtmlPhieu_(kq, h, cham, hs, maPhieu, logo, lanThi) {
  var cd = layCaiDat_();
  lanThi = lanThi || { lan: 1, ngayThi: '', lichSu: [] };
  var truoc = lanThi.lichSu.length ? lanThi.lichSu[lanThi.lichSu.length - 1] : null;
  var chenhLech = truoc ? soThuc_(cham.diem.tong, 0) - soThuc_(truoc.tong, 0) : 0;
  var t = HtmlService.createTemplateFromFile('Phieu');
  t.d = {
    trungTam: cd.tenTrungTam || '', khauHieu: cd.khauHieu || '', logo: logo || '',
    tieuDe: kq.thongTin.tieuDe, moTa: kq.thongTin.moTa, nhanLop: kq.thongTin.nhanLop,
    tenPhan: kq.thongTin.tenPhan, moTaPhan: kq.thongTin.moTaPhan,
    stt: h.stt, hoTen: hs.hoTen || h.hoTen, lop: lanThi.nhom || h.lop || '', maDe: h.maDe,
    cham: cham, nhanXet: h.nhanXet, maPhieu: maPhieu,
    lan: lanThi.lan, ngayThi: lanThi.ngayThi, lichSu: lanThi.lichSu,
    chenhLech: truoc ? (chenhLech > 0 ? '+' : '') + dinhDangDiem_(chenhLech) : '',
    tangDiem: chenhLech > 0, giamDiem: chenhLech < 0,
    ngay: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')
  };
  return t.evaluate().getContent();
}

/**
 * Ghép từng dòng file kết quả với DANH SÁCH HỌC SINH CỦA LỚP đã chọn.
 *   1. Có Mã HS  -> đúng em đó (phải thuộc lớp và họ tên khớp, nếu không -> hỏi giáo viên)
 *   2. Không có  -> theo họ tên trong lớp (duy nhất)
 *   3. Còn lại   -> hỏi giáo viên: chọn em trong lớp / em ở lớp khác / học sinh mới / bỏ qua
 * quyetDinh = { chỉ số dòng: Mã HS | 'moi' | 'boqua' }.
 * tuThemMoi: khi LỚP CHƯA CÓ HỌC SINH NÀO, dòng không trùng tên ai trong hệ thống -> tự coi là học sinh mới của lớp.
 * Trả về { dong: [ {hs, themVaoLop} | {moi} | {boQua} | {canChon, ungVien} | {loi} ], vang: [học sinh lớp không có kết quả], siSo }
 */
function ghepTheoLop_(dsKq, dsHs, nhom, quyetDinh, tuThemMoi) {
  quyetDinh = quyetDinh || {};
  var theoMa = {};
  dsHs.forEach(function (x) { theoMa[x.maHs] = x; });
  var lop = dsHs.filter(function (x) { return thuocNhom_(x, nhom); });
  var cungTen = function (h) { return dsHs.filter(function (x) { return khongDau_(x.hoTen) === khongDau_(h.hoTen); }); };
  var ghepMot = function (h, i) {
    var qd = quyetDinh[i];
    if (qd === 'boqua') return { boQua: true };
    if (qd === 'moi') return { moi: true };
    if (qd && theoMa[qd]) return { hs: theoMa[qd], themVaoLop: !thuocNhom_(theoMa[qd], nhom) };
    if (h.maHs) {
      var x = theoMa[h.maHs];
      if (!x) return { canChon: 'maLa', ungVien: cungTen(h) };
      if (!thuocNhom_(x, nhom)) return { canChon: 'ngoaiLop', ungVien: [x] };
      if (h.hoTen && khongDau_(h.hoTen) !== khongDau_(x.hoTen)) return { canChon: 'lechTen', ungVien: [x] };
      return { hs: x };
    }
    var trongLop = lop.filter(function (x) { return khongDau_(x.hoTen) === khongDau_(h.hoTen); });
    if (trongLop.length === 1) return { hs: trongLop[0] };
    if (trongLop.length > 1) return { canChon: 'trungTen', ungVien: trongLop };
    var khac = cungTen(h);
    // Lớp chưa có danh sách (lần gửi đầu) -> tự thêm. Lớp đã có danh sách -> tên lạ thường là gõ sai, phải hỏi giáo viên.
    if (!khac.length && tuThemMoi && !lop.length) return { moi: true, tuDong: true };
    return { canChon: 'khongCo', ungVien: khac };
  };
  var daGap = {};
  var dong = dsKq.map(function (h, i) {
    var r = ghepMot(h, i);
    if (r.hs) {
      if (daGap[r.hs.maHs]) r = { loi: 'Trùng học sinh với một dòng khác trong file (' + r.hs.maHs + ')' };
      else daGap[r.hs.maHs] = true;
    }
    return r;
  });
  return { dong: dong, vang: lop.filter(function (x) { return !daGap[x.maHs]; }), siSo: lop.length };
}

var LY_DO_CAN_CHON = {
  maLa: 'Mã HS trong file không có trong hệ thống',
  ngoaiLop: 'Học sinh này chưa thuộc lớp — thêm vào lớp?',
  lechTen: 'Họ tên trong file khác với họ tên của Mã HS',
  trungTen: 'Lớp có nhiều học sinh trùng họ tên — chọn đúng em',
  khongCo: 'Không tìm thấy trong lớp'
};

/* =====================================================================
 * 7. LƯU TRỮ (các tab trong Google Sheet)
 * ===================================================================== */

function laySpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* bỏ qua */ }
  var props = PropertiesService.getScriptProperties();
  if (ss) {
    if (props.getProperty('SPREADSHEET_ID') !== ss.getId()) props.setProperty('SPREADSHEET_ID', ss.getId());
    return ss;
  }
  var id = props.getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Chưa xác định được file Sheet. Hãy mở bảng điều khiển một lần.');
  return SpreadsheetApp.openById(id);
}

function khoiTao_(ss) {
  [[CAU_HINH.SHEET_HOC_SINH, COT_HS], [CAU_HINH.SHEET_NHOM, COT_NHOM], [CAU_HINH.SHEET_TAI_KHOAN, COT_TK], [CAU_HINH.SHEET_DOT, COT_DOT], [CAU_HINH.SHEET_PHIEU, COT_PHIEU]].forEach(function (x) {
    if (ss.getSheetByName(x[0])) return;
    var sh = ss.insertSheet(x[0]);
    if (x[0] !== CAU_HINH.SHEET_PHIEU && x[0] !== CAU_HINH.SHEET_DOT) sh.getRange('A:H').setNumberFormat('@');
    sh.getRange(1, 1, 1, x[1].length).setValues([x[1]]).setFontWeight('bold').setBackground('#e8f0fe');
    sh.setFrozenRows(1);
    sh.protect().setDescription('Dữ liệu hệ thống — nên sửa qua bảng điều khiển').setWarningOnly(true);
  });
}

function dsHocSinh_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COT_HS.length).getDisplayValues().map(function (r, i) {
    return { dong: i + 2, maHs: r[0].trim(), hoTen: r[1].trim(), lop: r[2].trim(), nhom: tachNhom_(r[2]), ngaySinh: r[3].trim(), sdt: r[4].trim(),
      ghiChu: r[5].trim(), maTraCuu: r[6].trim(), ngayTao: r[7].trim() };
  }).filter(function (h) { return h.maHs; });
}

function dsDot_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_DOT);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COT_DOT.length).getDisplayValues().map(function (r, i) {
    var ngayThi = r[CD.NGAY_THI - 1].trim();
    return { dong: i + 2, maDot: r[0].trim(), baiThi: r[CD.BAI - 1].trim(), lan: parseInt(r[CD.LAN - 1], 10) || 1,
      nhom: r[CD.NHOM - 1].trim(), ngayThi: ngayThi, thuTu: soThuTuNgay_(ngayThi), ngayTao: r[CD.NGAY_TAO - 1].trim(),
      soPhieu: Number(r[CD.SO_PHIEU - 1]) || 0, congBo: /^(true|có|x)$/i.test(r[CD.CONG_BO - 1].trim()), thuMuc: r[CD.THU_MUC - 1].trim() };
  }).filter(function (d) { return d.maDot; });
}

function dsNhom_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_NHOM);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0].trim(); }).filter(Boolean);
}

function dsPhieu_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_PHIEU);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COT_PHIEU.length).getValues().map(function (r) {
    return { maPhieu: String(r[0]), maDot: String(r[1]), maHs: String(r[2]).trim(), hoTen: String(r[3]),
      tongDiem: chuoiDiem_(r[4]), diemToiDa: String(r[5]), fileId: String(r[6]) };
  }).filter(function (p) { return p.maPhieu && p.fileId; });
}

function layThuMucGoc_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('THU_MUC_GOC');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* tạo lại */ } }
  var moi = DriveApp.createFolder(CAU_HINH.THU_MUC_GOC);
  props.setProperty('THU_MUC_GOC', moi.getId());
  return moi;
}

function layLogo_() {
  var link = layCaiDat_().logo;
  if (!link) return '';
  try {
    var blob = DriveApp.getFileById(layIdTuLink_(link)).getBlob();
    if (!/^image\/(png|jpeg|gif)$/.test(blob.getContentType())) return '';
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) { return ''; }
}

function voiKhoa_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* =====================================================================
 * 8. TIỆN ÍCH
 * ===================================================================== */

function chuoi_(x) { return x == null ? '' : String(x).trim(); }

/** "Toán 2; Tiếng Anh A1" -> ['Toán 2', 'Tiếng Anh A1'] (bỏ trùng, chấp nhận ; hoặc ,) */
function tachNhom_(s) {
  var daCo = {}, ds = [];
  String(s == null ? '' : s).split(/[;,\n]/).forEach(function (x) {
    x = x.replace(/\s+/g, ' ').trim();
    if (x && !daCo[khongDau_(x)]) { daCo[khongDau_(x)] = true; ds.push(x); }
  });
  return ds;
}

function noiNhom_(ds) { return tachNhom_((ds || []).join(';')).join('; '); }

function thuocNhom_(hs, nhom) {
  var k = khongDau_(nhom);
  return (hs.nhom || tachNhom_(hs.lop)).some(function (n) { return khongDau_(n) === k; });
}

function chuanHoaSdt_(s) { return String(s || '').replace(/\D/g, '').replace(/^84/, '0'); }

/** Bỏ dấu, chữ thường, bỏ ký tự không phải chữ/số — để so tên cột, tên tab, họ tên. */
function khongDau_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function timChiSo_(dsKhoa, dsTen) {
  for (var i = 0; i < dsTen.length; i++) { var j = dsKhoa.indexOf(dsTen[i]); if (j >= 0) return j; }
  return -1;
}

function timDongTieuDe_(bang, dieuKien) {
  for (var i = 0; i < Math.min(15, bang.length); i++) if (dieuKien(bang[i].map(khongDau_))) return i;
  return -1;
}

function chuanHoaPhan_(s) {
  var k = khongDau_(s).replace(/^phan/, '');
  return { i: 'I', '1': 'I', ii: 'II', '2': 'II', iii: 'III', '3': 'III' }[k] || '';
}

function chuanHoaDapAn_(s) {
  return String(s).normalize('NFC').toUpperCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/[;|]/g, ';');
}

/** "Đ,S,Đ,S" / "DSDS" / "đ s đ s" -> "DSDS" */
function chuoiDungSai_(s) {
  return String(s).normalize('NFC').toUpperCase().replace(/Đ/g, 'D').replace(/[^DS]/g, '');
}

function soThuc_(s, macDinh) {
  var n = parseFloat(String(s == null ? '' : s).replace(',', '.'));
  return isNaN(n) ? macDinh : n;
}

function dinhDangDiem_(n) { return (Math.round(n * 100) / 100).toFixed(2); }

function dinhDangSo_(n) { return String(Math.round(n * 100) / 100); }

/** Điểm đọc từ Sheet có thể là số (8.5) hoặc chuỗi ("8.50") -> luôn trả "8.50". */
function chuoiDiem_(x) { return x === '' || x == null ? '' : dinhDangDiem_(soThuc_(x, 0)); }

/** "5/9/2026", "05-09-2026", "2026-09-05" -> "05/09/2026" ('' nếu không hiểu). */
function chuanHoaNgay_(s) {
  s = chuoi_(s);
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1];
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
  return '';
}

/** "05/09/2026" -> 20260905 để sắp xếp theo thời gian. */
function soThuTuNgay_(s) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(chuanHoaNgay_(s));
  return m ? Number(m[3] + m[2] + m[1]) : 0;
}

function layIdTuLink_(s) {
  s = String(s).trim();
  var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s) || /\/folders\/([a-zA-Z0-9_-]{20,})/.exec(s) || /[?&]id=([a-zA-Z0-9_-]{20,})/.exec(s);
  return m ? m[1] : s;
}

function chuanHoaMa_(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function hienThiMa_(ma) { return ma.slice(0, 4) + '-' + ma.slice(4); }

/** Mã ngẫu nhiên từ UUID (nguồn ngẫu nhiên an toàn) + SHA-256, không lệch phân phối. */
function taoMaNgauNhien_() {
  var kyTu = CAU_HINH.KY_TU_MA, n = kyTu.length, gioiHan = Math.floor(256 / n) * n, ma = '';
  while (ma.length < CAU_HINH.DO_DAI_MA) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid());
    for (var i = 0; i < bytes.length && ma.length < CAU_HINH.DO_DAI_MA; i++) {
      var b = (bytes[i] + 256) % 256;
      if (b < gioiHan) ma += kyTu.charAt(b % n);
    }
  }
  return ma;
}

function taoMaKhongTrung_(daDung) {
  for (var lan = 0; lan < 100; lan++) {
    var m = taoMaNgauNhien_();
    if (!daDung[m]) { daDung[m] = true; return m; }
  }
  throw new Error('Không tạo được mã không trùng.');
}

function khoaPhut_() { return 'sai_' + Math.floor(Date.now() / 60000); }

function dangBiKhoa_() {
  return Number(CacheService.getScriptCache().get(khoaPhut_()) || 0) >= CAU_HINH.SO_LAN_SAI_TOI_DA_MOI_PHUT;
}

function ghiNhanSai_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var cache = CacheService.getScriptCache(), k = khoaPhut_();
    cache.put(k, String(Number(cache.get(k) || 0) + 1), 120);
  } finally { lock.releaseLock(); }
}

/* =====================================================================
 * 9. FILE MẪU KẾT QUẢ THI (dùng cho nút "Tải file mẫu" và file Excel trong thư mục mau/)
 * ===================================================================== */

var MAU_FILE_KET_QUA = {
  KetQua: [
    ['STT', 'Mã HS', 'Họ và tên', 'Lớp', 'Mã đề',
      'I.1', 'I.2', 'I.3', 'I.4', 'I.5', 'I.6', 'I.7', 'I.8', 'I.9', 'I.10', 'I.11', 'I.12',
      'II.1', 'II.2', 'II.3', 'II.4',
      'III.1', 'III.2', 'III.3', 'III.4', 'III.5', 'III.6',
      'Điểm phần I', 'Điểm phần II', 'Điểm phần III', 'Tổng điểm',
      'Ưu điểm', 'Nhược điểm', 'Hướng khắc phục', 'Lời khuyên'],
    ['1', '', 'Nguyễn Văn An', 'Toán 2', '105',
      'A', 'B', 'C', 'D', 'B', 'C', 'D', 'C', 'C', 'D', 'A', 'B',
      'Đ,Đ,S,S', 'Đ,Đ,Đ,S', 'Đ,S,Đ,S', 'Đ,S,S,S',
      '', '', '', '', '', '',
      '', '', '2.25', '',
      'Học lực giỏi, nắm bắt toàn diện kiến thức; nhận biết và thông hiểu tốt phần trắc nghiệm; phân tích và tư duy logic câu hỏi đúng/sai rất tốt.',
      'Chưa phát hiện nhược điểm lớn.', 'Phát huy phong độ hiện tại, mở rộng thêm các dạng bài nâng cao.', ''],
    ['2', '', 'Trần Thị Bình', 'Toán 2', '105',
      'A', 'C', 'C', 'D', 'B', 'A', 'D', 'A', 'B', 'D', 'A', 'C',
      'Đ,S,S,S', 'Đ,Đ,S,S', 'Đ,S,Đ,Đ', 'Đ,S,S,Đ',
      '', '', '', '', '', '',
      '', '', '1.5', '',
      'Chăm chỉ, nắm vững kiến thức cơ bản về lượng giác.', 'Còn nhầm lẫn khi biến đổi công thức lượng giác; chưa chắc phần cấp số nhân.',
      'Ôn lại công thức cộng, nhân đôi; luyện thêm bài tập cấp số nhân.', '']
  ],
  DeThi: [
    ['Phần', 'Câu', 'Chủ đề kiến thức', 'Mức độ', 'Nội dung phân tích cụ thể', 'Đáp án đúng'],
    ['I', '1', 'Lượng giác', '', 'Giá trị lượng giác của góc/cung lượng giác, góc phần tư', 'A'],
    ['I', '2', 'Lượng giác', '', 'Công thức lượng giác (cộng, nhân đôi, biến đổi tích-tổng)', 'B'],
    ['I', '3', 'Hàm số lượng giác', '', 'Tập xác định, tập giá trị, tính chẵn lẻ, chu kì tuần hoàn', 'C'],
    ['I', '4', 'Phương trình lượng giác', '', 'Nghiệm của phương trình lượng giác cơ bản (sin, cos, tan, cot)', 'D'],
    ['I', '5', 'Dãy số / Cấp số', '', 'Cấp số cộng (số hạng tổng quát, công sai)', 'B'],
    ['I', '6', 'Tổ hợp xác suất', '', 'Quy tắc đếm, hoán vị, chỉnh hợp, tổ hợp', 'C'],
    ['I', '7', 'Lượng giác', '', 'Biến đổi và tính giá trị lượng giác nâng cao', 'D'],
    ['I', '8', 'Phương trình lượng giác', '', 'Giải phương trình lượng giác cơ bản có điều kiện', 'A'],
    ['I', '9', 'Dãy số / Cấp số', '', 'Cấp số nhân hoặc tính tổng các số hạng của CSC/CSN', 'C'],
    ['I', '10', 'Xác suất', '', 'Tính xác suất của biến cố trong không gian mẫu cơ bản', 'D'],
    ['I', '11', 'Hàm số bậc hai', '', 'Tọa độ đỉnh, tính đồng biến/nghịch biến, GTLN-GTNN của Parabol', 'A'],
    ['I', '12', 'Hình học tọa độ Oxy', '', 'Đường thẳng, khoảng cách từ điểm đến đường thẳng, đường tròn', 'B'],
    ['II', '1', 'Hàm số lượng giác & Đồ thị', '', 'a) Tập xác định hàm lượng giác\nb) Dựa vào đồ thị tìm GTLN / GTNN\nc) Tính giá trị lượng giác của góc a\nd) Công thức nhân đôi góc lượng giác', 'ĐĐSS'],
    ['II', '2', 'Phương trình lượng giác', '', 'a) Kiểm tra nghiệm cụ thể\nb) Biến đổi tương đương phương trình cơ bản\nc) Số nghiệm trên một khoảng/đoạn cho trước\nd) Tổng các nghiệm thuộc đoạn cho trước', 'ĐĐĐS'],
    ['II', '3', 'Cấp số cộng / Cấp số nhân', '', 'a) Nhận biết CSC/CSN và tìm công sai/công bội\nb) Tính số hạng tổng quát thứ n\nc) Tính tổng n số hạng đầu tiên\nd) Tìm chỉ số n của số hạng thỏa mãn điều kiện', 'ĐSĐS'],
    ['II', '4', 'Ứng dụng thực tế (Parabol)', '', 'a) Độ cao ban đầu (tại thời điểm t = 0)\nb) Tính độ cao tại thời điểm t bất kỳ\nc) Thời điểm vật đạt độ cao lớn nhất (đỉnh Parabol)\nd) Khoảng thời gian vật ở trên một độ cao cho trước', 'ĐSSĐ'],
    ['III', '1', 'Lượng giác', 'Thông hiểu', 'Cho giá trị sin/cos và khoảng góc, tính giá trị lượng giác còn lại và biểu thức chứa sin2a, cos2a', '-4/5; 7/25'],
    ['III', '2', 'Phương trình lượng giác', 'Vận dụng', 'Giải phương trình lượng giác quy về phương trình bậc hai hoặc phương trình cơ bản, tìm nghiệm thuộc khoảng/đoạn', '3π/4; 7π/4'],
    ['III', '3', 'Quy hoạch tuyến tính', 'Vận dụng', 'Bài toán thực tế sản xuất xưởng: lập hệ bất phương trình, xác định miền nghiệm và tìm giá trị lớn nhất của tiền lãi', '500 nghìn đồng'],
    ['III', '4', 'Hình học tọa độ Oxy', 'Vận dụng', 'Viết phương trình tổng quát đường thẳng AB và phương trình đường tròn có tâm và tiếp xúc với đường thẳng', '2'],
    ['III', '5', 'Tổ hợp nâng cao', 'Vận dụng cao', 'Bài toán đếm nâng cao: sắp xếp học sinh xen kẽ, lập số tự nhiên thỏa điều kiện chữ số, chia nhóm', '72'],
    ['III', '6', 'Xác suất nâng cao', 'Vận dụng cao', 'Xác suất chọn số, gieo xúc xắc/đồng xu thỏa mãn các điều kiện tổng chia hết, tích chẵn/lẻ hoặc có mặt nhiều hơn', '1/3']
  ],
  ThongTin: [
    ['Mục', 'Giá trị', 'Ghi chú'],
    ['Tiêu đề phiếu', 'PHÂN TÍCH BÀI THI - THÁNG 9 NĂM 2026', 'Dòng tiêu đề lớn trên phiếu; cũng là tên đợt thi mặc định'],
    ['Mô tả', 'Bài thi cuối khóa 1 – Lớp 11', 'Dòng ngay dưới tiêu đề'],
    ['Ngày thi', '28/09/2026', 'dd/mm/yyyy — để sắp xếp các bài thi và lần làm theo thời gian'],
    ['Nhãn lớp', 'Lớp toán', 'Chữ hiển thị trước tên lớp trên phiếu'],
    ['Điểm mỗi câu phần I', '0.25', 'Dùng khi cột "Điểm phần I" để trống'],
    ['Điểm mỗi câu phần III', '0.5', 'Dùng khi cột "Điểm phần III" để trống và có nhập câu trả lời phần III'],
    ['Mô tả phần I', 'Phần này gồm 12 câu hỏi trắc nghiệm khách quan, các câu hỏi ở mức độ 1.', ''],
    ['Mô tả phần II', 'Phần này gồm 4 câu hỏi. Mỗi câu hỏi gồm 4 ý (a, b, c, d), yêu cầu học sinh phải nắm vững bản chất vấn đề và xét tính đúng/sai của từng mệnh đề độc lập.', ''],
    ['Mô tả phần III', 'Phần này gồm 6 câu hỏi, đòi hỏi tư duy cao hơn. Học sinh phải tự giải quyết bài toán và điền đáp án cuối cùng.', '']
  ],
  HuongDan: [
    ['HƯỚNG DẪN ĐIỀN FILE KẾT QUẢ'],
    ['• Tab KetQua: mỗi học sinh 1 dòng. Tải mẫu từ bảng điều khiển sau khi chọn lớp thì cột "Mã HS" và "Họ và tên" đã được điền sẵn — KHÔNG sửa cột Mã HS.'],
    ['• Cột I.1 … I.12: đáp án học sinh chọn ở phần I (A/B/C/D).'],
    ['• Cột II.1 … II.4: đáp án đúng/sai của 4 ý, viết "Đ,S,Đ,S" hoặc "ĐSĐS".'],
    ['• Cột III.1 … III.6: đáp số học sinh điền (có thể để trống nếu chấm tay và nhập thẳng "Điểm phần III").'],
    ['• Cột điểm để trống thì hệ thống tự tính: phần I 0,25đ/câu; phần II theo số ý đúng (1 ý 0,1 – 2 ý 0,25 – 3 ý 0,5 – 4 ý 1đ); phần III 0,5đ/câu.'],
    ['• Muốn thêm/bớt câu: thêm/xóa cột trong KetQua (vd I.13) và dòng tương ứng trong DeThi.'],
    ['• Tab DeThi: chủ đề, nội dung và đáp án đúng của từng câu. Nhiều mã đề: thêm cột "Đáp án mã 106", "Đáp án mã 107"…'],
    ['• Cùng 1 bài thi làm lại nhiều lần: gửi file mới và chọn đúng tên bài thi cũ → hệ thống tự ghi Lần 2, Lần 3… (giữ nguyên các lần trước).'],
    ['• Nhận xét (Ưu điểm, Nhược điểm, Hướng khắc phục, Lời khuyên) để trống thì phiếu sẽ bỏ qua mục đó (Lời khuyên có câu mặc định).']
  ]
};
