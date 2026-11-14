/**
 * TRA CỨU ĐIỂM RIÊNG CHO TỪNG PHỤ HUYNH
 * ------------------------------------------------------------
 * - Giáo viên nhập điểm trong Google Sheet (file để chế độ riêng tư).
 * - Mỗi học sinh có 1 mã tra cứu ngẫu nhiên, gửi riêng cho phụ huynh.
 * - Phụ huynh mở link trang tra cứu, nhập mã -> chỉ thấy điểm của con mình.
 *
 * Cấu trúc file Sheet:
 *   Tab "HocSinh":   Mã HS | Họ tên | Lớp | Mã tra cứu
 *   Các tab điểm:    tên bắt đầu bằng "Điểm" (vd "Điểm Giữa kỳ I")
 *                    phải có cột "Mã HS"; các cột còn lại là điểm/nhận xét.
 *                    Cột có tiêu đề bắt đầu bằng "#" sẽ KHÔNG hiển thị cho phụ huynh.
 *
 * LƯU Ý BẢO MẬT: mọi hàm phụ trợ đều kết thúc bằng dấu "_" để trang web
 * không gọi được. Chỉ doGet() và traCuu() được phép gọi từ trang tra cứu.
 */

var CAU_HINH = {
  TIEU_DE: 'Tra cứu điểm học sinh',
  TEN_SHEET_HOC_SINH: 'HocSinh',
  TIEN_TO_SHEET_DIEM: 'Điểm',
  TEN_SHEET_TIN_NHAN: 'TinNhan',
  DO_DAI_MA: 8,
  // Bỏ các ký tự dễ nhầm: 0/O, 1/I/L
  KY_TU_MA: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  // Tổng số lần nhập sai tối đa mỗi phút (toàn hệ thống) trước khi tạm khóa
  SO_LAN_SAI_TOI_DA_MOI_PHUT: 30
};

var COT = {
  MA_HS: 'Mã HS',
  HO_TEN: 'Họ tên',
  LOP: 'Lớp',
  MA_TRA_CUU: 'Mã tra cứu'
};

// Các cột không hiển thị trong bảng điểm (đã hiện ở phần thông tin học sinh)
var COT_AN_TRONG_BANG_DIEM = ['stt', 'mã hs', 'họ tên', 'lớp', 'mã tra cứu'];

/* =========================================================
 * PHẦN 1: TRANG TRA CỨU (phụ huynh dùng)
 * ========================================================= */

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.tieuDe = CAU_HINH.TIEU_DE;
  return t.evaluate()
    .setTitle(CAU_HINH.TIEU_DE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Hàm duy nhất trang web được gọi. Trả về điểm của ĐÚNG 1 học sinh.
 */
function traCuu(maNhap) {
  var LOI_SAI_MA = 'Mã tra cứu không đúng. Vui lòng kiểm tra lại mã giáo viên đã gửi.';
  try {
    if (dangBiKhoa_()) {
      return { ok: false, loi: 'Hệ thống đang tạm khóa do có quá nhiều lần nhập sai. Vui lòng thử lại sau 1–2 phút.' };
    }
    var ma = chuanHoaMa_(maNhap);
    if (ma.length !== CAU_HINH.DO_DAI_MA) {
      ghiNhanSai_();
      return { ok: false, loi: LOI_SAI_MA };
    }

    var ss = laySpreadsheet_();
    var hs = timHocSinhTheoMa_(ss, ma);
    if (!hs) {
      ghiNhanSai_();
      Utilities.sleep(1000); // làm chậm việc dò mã
      return { ok: false, loi: LOI_SAI_MA };
    }

    return {
      ok: true,
      hocSinh: { hoTen: hs.hoTen, lop: hs.lop },
      bangDiem: layDiemCuaHocSinh_(ss, hs.maHs)
    };
  } catch (e) {
    console.error(e);
    return { ok: false, loi: 'Có lỗi xảy ra, vui lòng thử lại sau.' };
  }
}

/* =========================================================
 * PHẦN 2: MENU CHO GIÁO VIÊN (trong Google Sheet)
 * ========================================================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 Tra cứu điểm')
    .addItem('1. Tạo bảng mẫu', 'menuTaoBangMau')
    .addItem('2. Tạo mã tra cứu cho học sinh chưa có mã', 'menuTaoMaTraCuu')
    .addItem('3. Lưu link trang tra cứu', 'menuLuuLink')
    .addItem('4. Tạo tin nhắn gửi phụ huynh', 'menuTaoTinNhan')
    .addSeparator()
    .addItem('Cấp lại mã cho học sinh đang chọn', 'menuCapLaiMa')
    .addToUi();
  try {
    PropertiesService.getScriptProperties()
      .setProperty('SPREADSHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  } catch (e) { /* simple trigger có thể không có quyền, bỏ qua */ }
}

// Mỗi hàm menu gọi getUi() đầu tiên: hàm này báo lỗi nếu bị gọi từ trang web,
// nên phụ huynh không thể kích hoạt các chức năng của giáo viên.

function menuTaoBangMau() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  luuIdSpreadsheet_(ss);

  if (!ss.getSheetByName(CAU_HINH.TEN_SHEET_HOC_SINH)) {
    var hs = ss.insertSheet(CAU_HINH.TEN_SHEET_HOC_SINH);
    hs.getRange(1, 1, 1, 4).setValues([[COT.MA_HS, COT.HO_TEN, COT.LOP, COT.MA_TRA_CUU]]).setFontWeight('bold');
    hs.getRange(2, 1, 2, 3).setValues([['HS001', 'Nguyễn Văn An', '6A'], ['HS002', 'Trần Thị Bình', '6A']]);
    hs.setFrozenRows(1);
    hs.getRange('A:A').setNumberFormat('@');
  }
  var tenDiem = CAU_HINH.TIEN_TO_SHEET_DIEM + ' Giữa kỳ I';
  if (!ss.getSheetByName(tenDiem)) {
    var d = ss.insertSheet(tenDiem);
    d.getRange(1, 1, 1, 7).setValues([[COT.MA_HS, COT.HO_TEN, 'Toán', 'Ngữ văn', 'Tiếng Anh', 'Nhận xét', '#Ghi chú riêng']]).setFontWeight('bold');
    d.getRange(2, 1, 2, 7).setValues([
      ['HS001', 'Nguyễn Văn An', 8.5, 7, 9, 'Chăm chỉ, cần cẩn thận hơn khi làm bài', 'Không hiện cho phụ huynh'],
      ['HS002', 'Trần Thị Bình', 9, 8.5, 7.5, 'Tiến bộ tốt', '']
    ]);
    d.setFrozenRows(1);
    d.getRange('A:A').setNumberFormat('@');
  }
  ui.alert('Đã tạo bảng mẫu.\n\n- Tab "' + CAU_HINH.TEN_SHEET_HOC_SINH + '": danh sách học sinh.\n- Tab "' + tenDiem +
    '": bảng điểm mẫu.\n\nThêm kỳ thi mới: tạo tab mới có tên bắt đầu bằng "' + CAU_HINH.TIEN_TO_SHEET_DIEM +
    '" và có cột "' + COT.MA_HS + '".');
}

function menuTaoMaTraCuu() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  luuIdSpreadsheet_(ss);
  var sh = laySheetHocSinh_(ss);
  var bang = docBang_(sh);
  var cMa = batBuocCot_(bang, COT.MA_TRA_CUU, sh);
  var cMaHs = batBuocCot_(bang, COT.MA_HS, sh);

  var daDung = {};
  bang.dong.forEach(function (r) {
    var m = chuanHoaMa_(r[cMa]);
    if (m) daDung[m] = true;
  });

  var soMoi = 0;
  var cotMa = bang.dong.map(function (r) {
    var cu = String(r[cMa] || '').trim();
    if (cu || !String(r[cMaHs] || '').trim()) return [cu];
    var moi = taoMaKhongTrung_(daDung);
    soMoi++;
    return [hienThiMa_(moi)];
  });
  if (cotMa.length) sh.getRange(2, cMa + 1, cotMa.length, 1).setNumberFormat('@').setValues(cotMa);
  ui.alert('Đã tạo ' + soMoi + ' mã tra cứu mới.\n(Học sinh đã có mã thì giữ nguyên mã cũ.)');
}

function menuCapLaiMa() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();
  if (sh.getName() !== CAU_HINH.TEN_SHEET_HOC_SINH) {
    ui.alert('Hãy mở tab "' + CAU_HINH.TEN_SHEET_HOC_SINH + '" và chọn 1 ô trên dòng của học sinh cần cấp lại mã.');
    return;
  }
  var dong = sh.getActiveRange().getRow();
  if (dong < 2) { ui.alert('Hãy chọn dòng của một học sinh (không phải dòng tiêu đề).'); return; }
  var bang = docBang_(sh);
  var cMa = batBuocCot_(bang, COT.MA_TRA_CUU, sh);
  var cTen = timCot_(bang.tieuDe, COT.HO_TEN);
  var ten = cTen >= 0 ? sh.getRange(dong, cTen + 1).getDisplayValue() : ('dòng ' + dong);

  var ok = ui.alert('Cấp lại mã cho "' + ten + '"?\nMã cũ sẽ không dùng được nữa.', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  var daDung = {};
  bang.dong.forEach(function (r) { var m = chuanHoaMa_(r[cMa]); if (m) daDung[m] = true; });
  var moi = hienThiMa_(taoMaKhongTrung_(daDung));
  sh.getRange(dong, cMa + 1).setNumberFormat('@').setValue(moi);
  ui.alert('Mã mới của "' + ten + '": ' + moi + '\nHãy gửi riêng mã này cho phụ huynh.');
}

function menuLuuLink() {
  var ui = SpreadsheetApp.getUi();
  var cu = PropertiesService.getScriptProperties().getProperty('LINK_TRA_CUU') || '(chưa có)';
  var res = ui.prompt('Link trang tra cứu',
    'Dán link Web App (dạng https://script.google.com/macros/s/.../exec).\nLink hiện tại: ' + cu,
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var link = res.getResponseText().trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(link)) {
    ui.alert('Link chưa đúng. Link phải bắt đầu bằng https://script.google.com/ và kết thúc bằng /exec');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('LINK_TRA_CUU', link);
  ui.alert('Đã lưu link.');
}

function menuTaoTinNhan() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var link = PropertiesService.getScriptProperties().getProperty('LINK_TRA_CUU');
  if (!link) { ui.alert('Chưa có link trang tra cứu. Hãy làm bước "3. Lưu link trang tra cứu" trước.'); return; }

  var sh = laySheetHocSinh_(ss);
  var bang = docBang_(sh);
  var cMa = batBuocCot_(bang, COT.MA_TRA_CUU, sh);
  var cTen = batBuocCot_(bang, COT.HO_TEN, sh);
  var cLop = timCot_(bang.tieuDe, COT.LOP);

  var out = [['Họ tên', 'Lớp', 'Tin nhắn (sao chép và gửi RIÊNG cho từng phụ huynh)']];
  var thieuMa = 0;
  bang.dong.forEach(function (r) {
    var ten = String(r[cTen] || '').trim();
    if (!ten) return;
    var ma = String(r[cMa] || '').trim();
    if (!ma) { thieuMa++; return; }
    var lop = cLop >= 0 ? String(r[cLop] || '').trim() : '';
    out.push([ten, lop,
      'Kính gửi phụ huynh em ' + ten + (lop ? ' (lớp ' + lop + ')' : '') + ',\n' +
      'Quý phụ huynh xem điểm của con tại: ' + link + '\n' +
      'Mã tra cứu: ' + ma + '\n' +
      'Vui lòng KHÔNG chia sẻ mã này cho người khác. Mã dùng được cho cả năm học.']);
  });

  var tn = ss.getSheetByName(CAU_HINH.TEN_SHEET_TIN_NHAN) || ss.insertSheet(CAU_HINH.TEN_SHEET_TIN_NHAN);
  tn.clear();
  tn.getRange(1, 1, out.length, 3).setValues(out);
  tn.getRange(1, 1, 1, 3).setFontWeight('bold');
  tn.setColumnWidth(3, 520);
  tn.getRange(2, 3, Math.max(out.length - 1, 1), 1).setWrap(true);
  tn.activate();
  ui.alert('Đã tạo ' + (out.length - 1) + ' tin nhắn ở tab "' + CAU_HINH.TEN_SHEET_TIN_NHAN + '".' +
    (thieuMa ? '\n' + thieuMa + ' học sinh chưa có mã: hãy chạy bước 2 trước.' : ''));
}

/* =========================================================
 * PHẦN 3: HÀM PHỤ TRỢ (riêng tư — kết thúc bằng "_")
 * ========================================================= */

function laySpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* bỏ qua */ }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Chưa xác định được file Sheet. Hãy mở Sheet và chạy menu "Tạo bảng mẫu" một lần.');
  return SpreadsheetApp.openById(id);
}

function luuIdSpreadsheet_(ss) {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
}

function laySheetHocSinh_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.TEN_SHEET_HOC_SINH);
  if (!sh) throw new Error('Không tìm thấy tab "' + CAU_HINH.TEN_SHEET_HOC_SINH + '". Hãy chạy menu "Tạo bảng mẫu".');
  return sh;
}

/** Đọc toàn bộ bảng (giá trị hiển thị, giữ nguyên định dạng điểm như 8,5). */
function docBang_(sh) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { tieuDe: [], dong: [] };
  var v = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  return { tieuDe: v[0].map(function (h) { return String(h).trim(); }), dong: v.slice(1) };
}

function chuanHoaTieuDe_(s) {
  return String(s || '').trim().toLowerCase().normalize('NFC').replace(/\s+/g, ' ');
}

function timCot_(tieuDe, ten) {
  var t = chuanHoaTieuDe_(ten);
  for (var i = 0; i < tieuDe.length; i++) if (chuanHoaTieuDe_(tieuDe[i]) === t) return i;
  return -1;
}

function batBuocCot_(bang, ten, sh) {
  var i = timCot_(bang.tieuDe, ten);
  if (i < 0) throw new Error('Tab "' + sh.getName() + '" thiếu cột "' + ten + '".');
  return i;
}

function chuanHoaMa_(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hienThiMa_(ma) {
  return ma.slice(0, 4) + '-' + ma.slice(4);
}

function timHocSinhTheoMa_(ss, ma) {
  var sh = laySheetHocSinh_(ss);
  var bang = docBang_(sh);
  var cMa = batBuocCot_(bang, COT.MA_TRA_CUU, sh);
  var cMaHs = batBuocCot_(bang, COT.MA_HS, sh);
  var cTen = timCot_(bang.tieuDe, COT.HO_TEN);
  var cLop = timCot_(bang.tieuDe, COT.LOP);
  for (var i = 0; i < bang.dong.length; i++) {
    var r = bang.dong[i];
    var maDong = chuanHoaMa_(r[cMa]);
    if (maDong && maDong.length === CAU_HINH.DO_DAI_MA && maDong === ma) {
      var maHs = String(r[cMaHs] || '').trim();
      if (!maHs) return null;
      return {
        maHs: maHs,
        hoTen: cTen >= 0 ? String(r[cTen]).trim() : '',
        lop: cLop >= 0 ? String(r[cLop]).trim() : ''
      };
    }
  }
  return null;
}

/** Gom điểm của 1 học sinh từ tất cả các tab có tên bắt đầu bằng "Điểm". */
function layDiemCuaHocSinh_(ss, maHs) {
  var tienTo = chuanHoaTieuDe_(CAU_HINH.TIEN_TO_SHEET_DIEM);
  var ketQua = [];
  ss.getSheets().forEach(function (sh) {
    if (sh.isSheetHidden()) return;
    if (chuanHoaTieuDe_(sh.getName()).indexOf(tienTo) !== 0) return;
    var bang = docBang_(sh);
    var cMaHs = timCot_(bang.tieuDe, COT.MA_HS);
    if (cMaHs < 0) return;
    var dong = null;
    for (var i = 0; i < bang.dong.length; i++) {
      if (String(bang.dong[i][cMaHs]).trim() === maHs) { dong = bang.dong[i]; break; }
    }
    if (!dong) return;
    var muc = [];
    bang.tieuDe.forEach(function (h, j) {
      if (!h || h.charAt(0) === '#') return;
      if (COT_AN_TRONG_BANG_DIEM.indexOf(chuanHoaTieuDe_(h)) >= 0) return;
      muc.push({ ten: h, giaTri: String(dong[j] == null ? '' : dong[j]).trim() });
    });
    ketQua.push({ tenBang: sh.getName(), muc: muc });
  });
  return ketQua;
}

/** Tạo mã ngẫu nhiên từ UUID (nguồn ngẫu nhiên an toàn) + SHA-256, không lệch phân phối. */
function taoMaNgauNhien_() {
  var kyTu = CAU_HINH.KY_TU_MA, n = kyTu.length;
  var gioiHan = Math.floor(256 / n) * n;
  var ma = '';
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

/* ---- Chống dò mã: đếm số lần nhập sai trong từng phút ---- */

function khoaPhut_() {
  return 'sai_' + Math.floor(Date.now() / 60000);
}

function dangBiKhoa_() {
  var n = Number(CacheService.getScriptCache().get(khoaPhut_()) || 0);
  return n >= CAU_HINH.SO_LAN_SAI_TOI_DA_MOI_PHUT;
}

function ghiNhanSai_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var cache = CacheService.getScriptCache(), k = khoaPhut_();
    cache.put(k, String(Number(cache.get(k) || 0) + 1), 120);
  } finally {
    lock.releaseLock();
  }
}
