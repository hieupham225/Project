/**
 * PHIẾU KẾT QUẢ KIỂM TRA RIÊNG CHO TỪNG PHỤ HUYNH
 * ------------------------------------------------------------
 * Quy trình:
 *   1. Giáo viên đưa file kết quả (Excel hoặc Google Sheet) vào 1 tab của file này.
 *   2. Giáo viên có 1 MẪU PHIẾU trên Google Docs (có thể mở từ file Word trộn thư đang dùng),
 *      trong đó các ô trộn viết dạng {{Tên cột}} hoặc «Tên_cột» (kiểu Word).
 *   3. Menu "Tạo phiếu" -> mỗi học sinh có 1 file PDF riêng (lưu trong Drive của giáo viên, không chia sẻ).
 *   4. Phụ huynh mở link chung, nhập MÃ TRA CỨU riêng -> chỉ xem được phiếu của con mình.
 *
 * Các tab trong file Sheet:
 *   HocSinh       Mã HS | Họ tên | Lớp | Mã tra cứu
 *   DotKiemTra    Tên đợt | Tab kết quả | Link mẫu phiếu | Công bố | Thư mục phiếu | Ghi chú
 *   PhieuKetQua   (tự sinh) danh sách file PDF đã tạo
 *   <tab kết quả> 1 dòng / học sinh, có cột "Mã HS" hoặc "Họ tên" để nhận diện học sinh
 *   Điểm ...      (tùy chọn) bảng điểm đơn giản, hiện dạng bảng cho phụ huynh
 *
 * BẢO MẬT: hàm phụ trợ kết thúc bằng "_" (trang web không gọi được).
 * Trang web chỉ gọi được doGet(), traCuu(), layPhieu(); hai hàm sau luôn kiểm tra mã tra cứu.
 * Các hàm menu* gọi SpreadsheetApp.getUi() đầu tiên -> báo lỗi nếu bị gọi từ trang web.
 */

var CAU_HINH = {
  TIEU_DE: 'Tra cứu kết quả học tập',
  SHEET_HOC_SINH: 'HocSinh',
  SHEET_DOT: 'DotKiemTra',
  SHEET_PHIEU: 'PhieuKetQua',
  SHEET_TIN_NHAN: 'TinNhan',
  TIEN_TO_SHEET_DIEM: 'Điểm',
  DO_DAI_MA: 8,
  KY_TU_MA: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // bỏ 0/O, 1/I/L
  SO_LAN_SAI_TOI_DA_MOI_PHUT: 30,
  THOI_GIAN_CHAY_TOI_DA_MS: 5 * 60 * 1000 // Apps Script giới hạn 6 phút/lần chạy
};

var COT = { MA_HS: 'Mã HS', HO_TEN: 'Họ tên', LOP: 'Lớp', MA_TRA_CUU: 'Mã tra cứu' };
var TEN_GOI_KHAC_HO_TEN = ['họ tên', 'họ và tên', 'tên học sinh', 'họ tên học sinh', 'ho ten', 'hoten', 'họtên'];
var TEN_GOI_KHAC_LOP = ['lớp', 'lớp toán', 'lớp học'];
var COT_DOT = { TEN: 'Tên đợt', TAB: 'Tab kết quả', MAU: 'Link mẫu phiếu', CONG_BO: 'Công bố', THU_MUC: 'Thư mục phiếu', GHI_CHU: 'Ghi chú' };
var COT_PHIEU = ['Đợt', 'Mã HS', 'Họ tên', 'File PDF', 'File ID', 'Thời gian tạo'];
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

/** Trả về danh sách phiếu + bảng điểm của ĐÚNG 1 học sinh ứng với mã. */
function traCuu(maNhap) {
  return chayAnToan_(maNhap, function (ss, hs) {
    return {
      ok: true,
      hocSinh: { hoTen: hs.hoTen, lop: hs.lop },
      phieu: danhSachPhieuDaCongBo_(ss, hs.maHs).map(function (p) {
        return { dot: p.dot, thoiGian: p.thoiGian };
      }),
      bangDiem: layDiemCuaHocSinh_(ss, hs.maHs)
    };
  });
}

/** Trả về nội dung PDF (base64) của 1 phiếu — chỉ khi mã đúng và phiếu thuộc học sinh đó. */
function layPhieu(maNhap, tenDot) {
  return chayAnToan_(maNhap, function (ss, hs) {
    var ds = danhSachPhieuDaCongBo_(ss, hs.maHs);
    var p = null;
    for (var i = 0; i < ds.length; i++) if (ds[i].dot === String(tenDot)) { p = ds[i]; break; }
    if (!p) return { ok: false, loi: 'Không tìm thấy phiếu kết quả.' };
    var file = DriveApp.getFileById(p.fileId);
    return {
      ok: true,
      tenFile: file.getName(),
      pdf: Utilities.base64Encode(file.getBlob().getBytes())
    };
  });
}

function chayAnToan_(maNhap, xuLy) {
  var LOI_SAI_MA = 'Mã tra cứu không đúng. Vui lòng kiểm tra lại mã giáo viên đã gửi.';
  try {
    if (dangBiKhoa_()) {
      return { ok: false, loi: 'Hệ thống đang tạm khóa do có quá nhiều lần nhập sai. Vui lòng thử lại sau 1–2 phút.' };
    }
    var ma = chuanHoaMa_(maNhap);
    if (ma.length !== CAU_HINH.DO_DAI_MA) { ghiNhanSai_(); return { ok: false, loi: LOI_SAI_MA }; }
    var ss = laySpreadsheet_();
    var hs = timHocSinhTheoMa_(ss, ma);
    if (!hs) { ghiNhanSai_(); Utilities.sleep(1000); return { ok: false, loi: LOI_SAI_MA }; }
    return xuLy(ss, hs);
  } catch (e) {
    console.error(e);
    return { ok: false, loi: 'Có lỗi xảy ra, vui lòng thử lại sau.' };
  }
}

/* =========================================================
 * PHẦN 2: MENU CHO GIÁO VIÊN
 * ========================================================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 Tra cứu điểm')
    .addItem('1. Cài đặt ban đầu (tạo các tab)', 'menuCaiDat')
    .addItem('2. Nhập kết quả từ link Google Sheet', 'menuNhapTuLink')
    .addItem('3. Thêm học sinh từ tab kết quả đang mở', 'menuThemHocSinhTuKetQua')
    .addItem('4. Tạo mã tra cứu cho học sinh chưa có mã', 'menuTaoMaTraCuu')
    .addSeparator()
    .addItem('5. Tạo phiếu PDF cho đợt đang chọn', 'menuTaoPhieu')
    .addItem('Xóa phiếu của đợt đang chọn (để tạo lại)', 'menuXoaPhieu')
    .addItem('Tạo mẫu phiếu ví dụ (Google Docs)', 'menuTaoMauPhieuViDu')
    .addSeparator()
    .addItem('6. Lưu link trang tra cứu', 'menuLuuLink')
    .addItem('7. Tạo tin nhắn gửi mã cho phụ huynh', 'menuTaoTinNhan')
    .addItem('Cấp lại mã cho học sinh đang chọn', 'menuCapLaiMa')
    .addToUi();
  try {
    PropertiesService.getScriptProperties()
      .setProperty('SPREADSHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  } catch (e) { /* simple trigger có thể không đủ quyền */ }
}

function menuCaiDat() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  luuIdSpreadsheet_(ss);
  var daTao = [];

  if (!ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH)) {
    var hs = ss.insertSheet(CAU_HINH.SHEET_HOC_SINH);
    hs.getRange('A:D').setNumberFormat('@');
    hs.getRange(1, 1, 1, 4).setValues([[COT.MA_HS, COT.HO_TEN, COT.LOP, COT.MA_TRA_CUU]]).setFontWeight('bold');
    hs.setFrozenRows(1);
    daTao.push(CAU_HINH.SHEET_HOC_SINH);
  }
  if (!ss.getSheetByName(CAU_HINH.SHEET_DOT)) {
    var d = ss.insertSheet(CAU_HINH.SHEET_DOT);
    d.getRange(1, 1, 1, 6).setValues([[COT_DOT.TEN, COT_DOT.TAB, COT_DOT.MAU, COT_DOT.CONG_BO, COT_DOT.THU_MUC, COT_DOT.GHI_CHU]])
      .setFontWeight('bold');
    d.getRange('D2:D200').insertCheckboxes();
    d.setFrozenRows(1);
    d.setColumnWidth(3, 320);
    d.getRange(2, 6).setValue('← Ví dụ: Tên đợt "Tháng 9/2026", Tab kết quả "KQ Thang 9"');
    daTao.push(CAU_HINH.SHEET_DOT);
  }
  layHoacTaoSheetPhieu_(ss);
  ui.alert(daTao.length ? 'Đã tạo các tab: ' + daTao.join(', ') + '.' : 'Các tab đã có sẵn.');
}

/** Nhập dữ liệu từ 1 link Google Sheet khác vào tab mới (file Excel thì dùng Tệp > Nhập). */
function menuNhapTuLink() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var r1 = ui.prompt('Nhập kết quả từ Google Sheet', 'Dán link Google Sheet chứa kết quả:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var nguon;
  try { nguon = SpreadsheetApp.openByUrl(r1.getResponseText().trim()); }
  catch (e) { ui.alert('Không mở được link. Kiểm tra lại link và quyền truy cập của bạn với file đó.'); return; }

  var tabs = nguon.getSheets().map(function (s) { return s.getName(); });
  var r2 = ui.prompt('Chọn tab', 'File có các tab: ' + tabs.join(', ') +
    '\nNhập tên tab cần lấy (để trống = tab đầu tiên):', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var shNguon = r2.getResponseText().trim() ? nguon.getSheetByName(r2.getResponseText().trim()) : nguon.getSheets()[0];
  if (!shNguon) { ui.alert('Không có tab tên đó.'); return; }

  var r3 = ui.prompt('Tên tab mới', 'Đặt tên cho tab kết quả trong file này (vd: KQ Thang 9):', ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  var ten = r3.getResponseText().trim();
  if (!ten) return;
  if (ss.getSheetByName(ten)) { ui.alert('Đã có tab "' + ten + '". Hãy chọn tên khác.'); return; }

  var v = shNguon.getDataRange().getDisplayValues();
  var moi = ss.insertSheet(ten);
  moi.getRange(1, 1, v.length, v[0].length).setNumberFormat('@').setValues(v);
  moi.activate();
  ui.alert('Đã nhập ' + v.length + ' dòng vào tab "' + ten + '".');
}

/** Lấy học sinh từ tab kết quả đang mở, thêm những em chưa có vào tab HocSinh. */
function menuThemHocSinhTuKetQua() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();
  if ([CAU_HINH.SHEET_HOC_SINH, CAU_HINH.SHEET_DOT, CAU_HINH.SHEET_PHIEU, CAU_HINH.SHEET_TIN_NHAN].indexOf(sh.getName()) >= 0) {
    ui.alert('Hãy mở tab chứa KẾT QUẢ KIỂM TRA rồi chạy lại chức năng này.');
    return;
  }
  var kq = docBangKetQua_(sh);
  if (!kq) { ui.alert('Không tìm thấy dòng tiêu đề có cột "Họ tên" (hoặc "Họ và tên") trong tab này.'); return; }

  var shHs = laySheetHocSinh_(ss);
  var bangHs = docBang_(shHs, 0);
  var cTen = timCotTheoTen_(bangHs.tieuDe, TEN_GOI_KHAC_HO_TEN);
  var cMaHs = timCot_(bangHs.tieuDe, COT.MA_HS);
  var cLop = timCotTheoTen_(bangHs.tieuDe, TEN_GOI_KHAC_LOP);
  if (cTen < 0 || cMaHs < 0) { ui.alert('Tab HocSinh thiếu cột "Mã HS" hoặc "Họ tên".'); return; }

  var daCo = {}, maxSo = 0;
  bangHs.dong.forEach(function (r) {
    daCo[chuanHoaTen_(r[cTen])] = true;
    var m = /(\d+)$/.exec(String(r[cMaHs]));
    if (m) maxSo = Math.max(maxSo, Number(m[1]));
  });

  var them = [];
  kq.dong.forEach(function (r) {
    var ten = String(r[kq.cTen] || '').trim();
    if (!ten || daCo[chuanHoaTen_(ten)]) return;
    daCo[chuanHoaTen_(ten)] = true;
    var maHs = kq.cMaHs >= 0 && String(r[kq.cMaHs]).trim() ? String(r[kq.cMaHs]).trim()
      : 'HS' + ('000' + (++maxSo)).slice(-3);
    var lop = kq.cLop >= 0 ? String(r[kq.cLop] || '').trim() : '';
    var dong = [];
    for (var i = 0; i < bangHs.tieuDe.length; i++) dong.push('');
    dong[cMaHs] = maHs; dong[cTen] = ten; if (cLop >= 0) dong[cLop] = lop;
    them.push(dong);
  });
  if (them.length) {
    shHs.getRange(shHs.getLastRow() + 1, 1, them.length, bangHs.tieuDe.length).setNumberFormat('@').setValues(them);
  }
  ui.alert('Đã thêm ' + them.length + ' học sinh mới vào tab "' + CAU_HINH.SHEET_HOC_SINH + '".' +
    (them.length ? '\nTiếp theo: chạy "4. Tạo mã tra cứu cho học sinh chưa có mã".' : ''));
}

function menuTaoMaTraCuu() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  luuIdSpreadsheet_(ss);
  var sh = laySheetHocSinh_(ss);
  var bang = docBang_(sh, 0);
  var cMa = batBuocCot_(bang, COT.MA_TRA_CUU, sh);
  var cMaHs = batBuocCot_(bang, COT.MA_HS, sh);

  var daDung = {};
  bang.dong.forEach(function (r) { var m = chuanHoaMa_(r[cMa]); if (m) daDung[m] = true; });
  var soMoi = 0;
  var cotMa = bang.dong.map(function (r) {
    var cu = String(r[cMa] || '').trim();
    if (cu || !String(r[cMaHs] || '').trim()) return [cu];
    soMoi++;
    return [hienThiMa_(taoMaKhongTrung_(daDung))];
  });
  if (cotMa.length) sh.getRange(2, cMa + 1, cotMa.length, 1).setNumberFormat('@').setValues(cotMa);
  ui.alert('Đã tạo ' + soMoi + ' mã tra cứu mới.\n(Học sinh đã có mã thì giữ nguyên.)');
}

/** Tạo phiếu PDF cho đợt ở dòng đang chọn trong tab DotKiemTra. Chạy lại để tiếp tục nếu bị ngắt. */
function menuTaoPhieu() {
  var ui = SpreadsheetApp.getUi();
  var batDau = Date.now();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  luuIdSpreadsheet_(ss);
  var dot = layDotDangChon_(ss, ui);
  if (!dot) return;

  // 1. Tab kết quả
  var shKq = ss.getSheetByName(dot.tab);
  if (!shKq) { ui.alert('Không tìm thấy tab kết quả "' + dot.tab + '".'); return; }
  var kq = docBangKetQua_(shKq);
  if (!kq) { ui.alert('Tab "' + dot.tab + '" cần có cột "Mã HS" hoặc "Họ tên".'); return; }

  // 2. Mẫu phiếu
  var mau;
  try { mau = DriveApp.getFileById(layIdTuLink_(dot.mau)); }
  catch (e) { ui.alert('Không mở được "Link mẫu phiếu". Hãy dán link Google Docs của mẫu phiếu.'); return; }
  if (mau.getMimeType() !== MimeType.GOOGLE_DOCS) {
    ui.alert('Mẫu phiếu phải là Google Docs.\nNếu đang là file Word: mở file bằng Google Docs → Tệp → Lưu dưới dạng Google Tài liệu, rồi dùng link của bản mới.');
    return;
  }

  // 3. Kiểm tra ô trộn trong mẫu có khớp tên cột không
  var docMau = DocumentApp.openById(mau.getId());
  var truongMau = timTruongTron_(docMau);
  var coCot = {};
  kq.tieuDe.forEach(function (h) { if (h) coCot[chuanHoaTruong_(h)] = true; });
  var thieu = truongMau.filter(function (t) { return !coCot[chuanHoaTruong_(t)]; });
  if (!truongMau.length) {
    ui.alert('Mẫu phiếu chưa có ô trộn nào. Hãy viết ô trộn dạng {{Tên cột}} hoặc «Tên_cột».');
    return;
  }
  if (thieu.length) {
    var tiep = ui.alert('Các ô trộn sau không có cột tương ứng trong tab "' + dot.tab + '" (sẽ để trống):\n\n' +
      thieu.join(', ') + '\n\nVẫn tiếp tục tạo phiếu?', ui.ButtonSet.YES_NO);
    if (tiep !== ui.Button.YES) return;
  }

  // 4. Thư mục lưu phiếu (riêng tư trong Drive của giáo viên)
  var thuMuc = layHoacTaoThuMuc_(ss, dot);

  // 5. Ghép học sinh và tạo phiếu
  var dsHs = layDanhSachHocSinh_(ss);
  var shPhieu = layHoacTaoSheetPhieu_(ss);
  var daCo = {};
  docDanhSachPhieu_(shPhieu).forEach(function (p) { if (p.dot === dot.ten) daCo[p.maHs] = true; });

  var soTao = 0, boQua = [], conLai = 0;
  for (var i = 0; i < kq.dong.length; i++) {
    var r = kq.dong[i];
    var maHsKq = kq.cMaHs >= 0 ? String(r[kq.cMaHs] || '').trim() : '';
    var tenKq = kq.cTen >= 0 ? String(r[kq.cTen] || '').trim() : '';
    if (!maHsKq && !tenKq) continue;

    var hs = ghepHocSinh_(dsHs, maHsKq, tenKq);
    if (hs.loi) { boQua.push((tenKq || maHsKq) + ' — ' + hs.loi); continue; }
    if (daCo[hs.maHs]) continue;
    if (Date.now() - batDau > CAU_HINH.THOI_GIAN_CHAY_TOI_DA_MS) { conLai++; continue; }

    var duLieu = {};
    kq.tieuDe.forEach(function (h, j) { if (h) duLieu[chuanHoaTruong_(h)] = String(r[j] == null ? '' : r[j]); });
    var tenFile = dot.ten + ' - ' + hs.hoTen + ' - ' + hs.maHs;
    var pdf = taoMotPhieu_(mau, thuMuc, tenFile, duLieu);
    shPhieu.appendRow([dot.ten, hs.maHs, hs.hoTen, pdf.getUrl(), pdf.getId(), new Date()]);
    daCo[hs.maHs] = true;
    soTao++;
  }

  var tb = 'Đợt "' + dot.ten + '": đã tạo ' + soTao + ' phiếu PDF.\nThư mục: ' + thuMuc.getUrl();
  if (conLai) tb += '\n\n⏳ Còn ' + conLai + ' phiếu chưa tạo do hết thời gian. Hãy chạy lại chức năng này để tạo tiếp.';
  if (boQua.length) tb += '\n\n⚠️ Bỏ qua ' + boQua.length + ' dòng:\n- ' + boQua.slice(0, 15).join('\n- ') +
    (boQua.length > 15 ? '\n...' : '') + '\n(Thêm học sinh vào tab HocSinh bằng chức năng 3 rồi chạy lại.)';
  if (!conLai) tb += '\n\nHãy mở thư mục để kiểm tra phiếu, sau đó tích ô "Công bố" của đợt này để phụ huynh xem được.';
  ui.alert(tb);
}

function menuXoaPhieu() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dot = layDotDangChon_(ss, ui);
  if (!dot) return;
  var ok = ui.alert('Xóa toàn bộ phiếu PDF của đợt "' + dot.ten + '"?\n(File chuyển vào Thùng rác của Drive.)', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  var sh = layHoacTaoSheetPhieu_(ss);
  var v = sh.getDataRange().getValues();
  var so = 0;
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][0]) !== dot.ten) continue;
    try { DriveApp.getFileById(String(v[i][4])).setTrashed(true); } catch (e) { /* file đã bị xóa */ }
    sh.deleteRow(i + 1);
    so++;
  }
  ui.alert('Đã xóa ' + so + ' phiếu của đợt "' + dot.ten + '".');
}

/** Tạo 1 mẫu phiếu Google Docs ví dụ, dùng tên cột của tab đang mở. */
function menuTaoMauPhieuViDu() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kq = docBangKetQua_(ss.getActiveSheet());
  var cot = kq ? kq.tieuDe.filter(function (h) { return h; }) : ['Họ tên', 'Lớp', 'Điểm', 'Nhận xét'];

  var doc = DocumentApp.create('Mẫu phiếu kết quả (ví dụ)');
  var body = doc.getBody();
  body.appendParagraph('PHIẾU KẾT QUẢ KIỂM TRA').setHeading(DocumentApp.ParagraphHeading.HEADING1)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('Mỗi ô {{...}} sẽ được thay bằng dữ liệu của từng học sinh. ' +
    'Bạn có thể sửa bố cục, màu sắc, thêm logo… tùy ý; chỉ cần giữ nguyên các ô {{...}}.').setItalic(true);
  var bang = cot.map(function (h) { return [h, '{{' + h + '}}']; });
  var t = body.appendTable(bang);
  for (var i = 0; i < t.getNumRows(); i++) t.getRow(i).getCell(0).editAsText().setBold(true);
  doc.saveAndClose();
  ui.alert('Đã tạo mẫu phiếu ví dụ:\n' + doc.getUrl() + '\n\nDán link này vào cột "Link mẫu phiếu" của tab DotKiemTra.');
}

function menuCapLaiMa() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getActiveSheet();
  if (sh.getName() !== CAU_HINH.SHEET_HOC_SINH) {
    ui.alert('Hãy mở tab "' + CAU_HINH.SHEET_HOC_SINH + '" và chọn 1 ô trên dòng của học sinh cần cấp lại mã.');
    return;
  }
  var dong = sh.getActiveRange().getRow();
  if (dong < 2) { ui.alert('Hãy chọn dòng của một học sinh (không phải dòng tiêu đề).'); return; }
  var bang = docBang_(sh, 0);
  var cMa = batBuocCot_(bang, COT.MA_TRA_CUU, sh);
  var cTen = timCotTheoTen_(bang.tieuDe, TEN_GOI_KHAC_HO_TEN);
  var ten = cTen >= 0 ? sh.getRange(dong, cTen + 1).getDisplayValue() : ('dòng ' + dong);
  if (ui.alert('Cấp lại mã cho "' + ten + '"?\nMã cũ sẽ không dùng được nữa.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

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
    'Dán link Web App (dạng https://script.google.com/macros/s/.../exec).\nLink hiện tại: ' + cu, ui.ButtonSet.OK_CANCEL);
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
  if (!link) { ui.alert('Chưa có link trang tra cứu. Hãy làm bước "6. Lưu link trang tra cứu" trước.'); return; }

  var out = [['Họ tên', 'Lớp', 'Tin nhắn (sao chép và gửi RIÊNG cho từng phụ huynh)']];
  var thieuMa = 0;
  layDanhSachHocSinh_(ss).forEach(function (hs) {
    if (!hs.hoTen) return;
    if (!hs.maTraCuu) { thieuMa++; return; }
    out.push([hs.hoTen, hs.lop,
      'Kính gửi phụ huynh em ' + hs.hoTen + (hs.lop ? ' (lớp ' + hs.lop + ')' : '') + ',\n' +
      'Quý phụ huynh xem kết quả học tập của con tại: ' + link + '\n' +
      'Mã tra cứu: ' + hs.maTraCuu + '\n' +
      'Vui lòng KHÔNG chia sẻ mã này cho người khác. Mã dùng được cho cả năm học.']);
  });
  var tn = ss.getSheetByName(CAU_HINH.SHEET_TIN_NHAN) || ss.insertSheet(CAU_HINH.SHEET_TIN_NHAN);
  tn.clear();
  tn.getRange(1, 1, out.length, 3).setValues(out);
  tn.getRange(1, 1, 1, 3).setFontWeight('bold');
  tn.setColumnWidth(3, 520);
  tn.getRange(2, 3, Math.max(out.length - 1, 1), 1).setWrap(true);
  tn.activate();
  ui.alert('Đã tạo ' + (out.length - 1) + ' tin nhắn ở tab "' + CAU_HINH.SHEET_TIN_NHAN + '".' +
    (thieuMa ? '\n' + thieuMa + ' học sinh chưa có mã: hãy chạy bước 4 trước.' : ''));
}

/* =========================================================
 * PHẦN 3: TRỘN VĂN BẢN → PDF
 * ========================================================= */

var MAU_TRUONG_TRON = /\{\{\s*([^{}]+?)\s*\}\}|«\s*([^«»]+?)\s*»/g;

function cacPhanCuaDoc_(doc) {
  return [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(function (p) { return p; });
}

/** Liệt kê tên các ô trộn ({{...}} hoặc «...») có trong mẫu. */
function timTruongTron_(doc) {
  var thay = {}, ds = [];
  cacPhanCuaDoc_(doc).forEach(function (p) {
    var text = p.getText(), m;
    MAU_TRUONG_TRON.lastIndex = 0;
    while ((m = MAU_TRUONG_TRON.exec(text))) {
      var ten = m[1] || m[2];
      if (!thay[ten]) { thay[ten] = true; ds.push(ten); }
    }
  });
  return ds;
}

/** Thay mọi ô trộn trong 1 phần văn bản bằng dữ liệu (giữ nguyên định dạng, màu chữ của ô trộn). */
function thayTruongTron_(phan, duLieu) {
  var text = phan.getText(), m, daThay = {};
  MAU_TRUONG_TRON.lastIndex = 0;
  while ((m = MAU_TRUONG_TRON.exec(text))) {
    var nguyenVan = m[0];
    if (daThay[nguyenVan]) continue;
    daThay[nguyenVan] = true;
    var key = chuanHoaTruong_(m[1] || m[2]);
    var giaTri = Object.prototype.hasOwnProperty.call(duLieu, key) ? duLieu[key] : '';
    phan.replaceText(escapeRegex_(nguyenVan), escapeThayThe_(giaTri));
  }
}

function taoMotPhieu_(mau, thuMuc, tenFile, duLieu) {
  var banSao = mau.makeCopy(tenFile, thuMuc);
  try {
    var doc = DocumentApp.openById(banSao.getId());
    cacPhanCuaDoc_(doc).forEach(function (p) { thayTruongTron_(p, duLieu); });
    doc.saveAndClose();
    return thuMuc.createFile(banSao.getAs(MimeType.PDF).setName(tenFile + '.pdf'));
  } finally {
    banSao.setTrashed(true);
  }
}

/* =========================================================
 * PHẦN 4: HÀM PHỤ TRỢ
 * ========================================================= */

function laySpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* bỏ qua */ }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Chưa xác định được file Sheet. Hãy mở Sheet và chạy "Cài đặt ban đầu" một lần.');
  return SpreadsheetApp.openById(id);
}

function luuIdSpreadsheet_(ss) {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
}

function laySheetHocSinh_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
  if (!sh) throw new Error('Không tìm thấy tab "' + CAU_HINH.SHEET_HOC_SINH + '". Hãy chạy "1. Cài đặt ban đầu".');
  return sh;
}

function layHoacTaoSheetPhieu_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_PHIEU);
  if (!sh) {
    sh = ss.insertSheet(CAU_HINH.SHEET_PHIEU);
    sh.getRange(1, 1, 1, COT_PHIEU.length).setValues([COT_PHIEU]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function docDanhSachPhieu_(shPhieu) {
  var v = shPhieu.getDataRange().getValues();
  var ds = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i][0] || !v[i][4]) continue;
    ds.push({ dot: String(v[i][0]), maHs: String(v[i][1]).trim(), fileId: String(v[i][4]), thoiGian: v[i][5] });
  }
  return ds;
}

/** Phiếu của 1 học sinh, chỉ thuộc các đợt đã tích "Công bố"; mới nhất lên đầu. */
function danhSachPhieuDaCongBo_(ss, maHs) {
  var shPhieu = ss.getSheetByName(CAU_HINH.SHEET_PHIEU);
  var shDot = ss.getSheetByName(CAU_HINH.SHEET_DOT);
  if (!shPhieu || !shDot) return [];
  var congBo = {};
  docDanhSachDot_(shDot).forEach(function (d) { if (d.congBo) congBo[d.ten] = true; });
  var ds = docDanhSachPhieu_(shPhieu).filter(function (p) { return p.maHs === maHs && congBo[p.dot]; });
  ds.sort(function (a, b) { return new Date(b.thoiGian) - new Date(a.thoiGian); });
  return ds.map(function (p) {
    var tg = p.thoiGian && typeof p.thoiGian.getTime === 'function' ? Utilities.formatDate(p.thoiGian, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') : '';
    return { dot: p.dot, fileId: p.fileId, thoiGian: tg };
  });
}

function docDanhSachDot_(shDot) {
  var v = shDot.getDataRange().getValues();
  var h = v[0].map(function (x) { return String(x).trim(); });
  var c = {
    ten: timCot_(h, COT_DOT.TEN), tab: timCot_(h, COT_DOT.TAB), mau: timCot_(h, COT_DOT.MAU),
    congBo: timCot_(h, COT_DOT.CONG_BO), thuMuc: timCot_(h, COT_DOT.THU_MUC)
  };
  var ds = [];
  for (var i = 1; i < v.length; i++) {
    var ten = c.ten >= 0 ? String(v[i][c.ten]).trim() : '';
    if (!ten) continue;
    ds.push({
      dong: i + 1, ten: ten,
      tab: c.tab >= 0 ? String(v[i][c.tab]).trim() : '',
      mau: c.mau >= 0 ? String(v[i][c.mau]).trim() : '',
      congBo: c.congBo >= 0 && (v[i][c.congBo] === true || /^(true|có|x|yes)$/i.test(String(v[i][c.congBo]).trim())),
      thuMuc: c.thuMuc >= 0 ? String(v[i][c.thuMuc]).trim() : '',
      cotThuMuc: c.thuMuc
    });
  }
  return ds;
}

function layDotDangChon_(ss, ui) {
  var sh = ss.getActiveSheet();
  if (sh.getName() !== CAU_HINH.SHEET_DOT) {
    ui.alert('Hãy mở tab "' + CAU_HINH.SHEET_DOT + '" và chọn 1 ô trên dòng của đợt kiểm tra cần xử lý.');
    return null;
  }
  var dong = sh.getActiveRange().getRow();
  var dot = docDanhSachDot_(sh).filter(function (d) { return d.dong === dong; })[0];
  if (!dot) { ui.alert('Dòng đang chọn chưa có "' + COT_DOT.TEN + '".'); return null; }
  if (!dot.tab || !dot.mau) {
    ui.alert('Hãy điền đủ "' + COT_DOT.TAB + '" và "' + COT_DOT.MAU + '" cho đợt "' + dot.ten + '".');
    return null;
  }
  return dot;
}

function layHoacTaoThuMuc_(ss, dot) {
  if (dot.thuMuc) {
    try { return DriveApp.getFolderById(layIdTuLink_(dot.thuMuc)); } catch (e) { /* tạo mới */ }
  }
  var tm = DriveApp.createFolder('Phiếu kết quả - ' + dot.ten);
  if (dot.cotThuMuc >= 0) ss.getSheetByName(CAU_HINH.SHEET_DOT).getRange(dot.dong, dot.cotThuMuc + 1).setValue(tm.getUrl());
  return tm;
}

function layIdTuLink_(s) {
  s = String(s).trim();
  var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s) || /\/folders\/([a-zA-Z0-9_-]{20,})/.exec(s) || /[?&]id=([a-zA-Z0-9_-]{20,})/.exec(s);
  return m ? m[1] : s;
}

/** Đọc bảng; dongTieuDe là chỉ số (0-based) của dòng tiêu đề. Dùng giá trị hiển thị (giữ "8,5", "3π/4"...). */
function docBang_(sh, dongTieuDe) {
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { tieuDe: [], dong: [] };
  var v = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var h = v[dongTieuDe] || [];
  return { tieuDe: h.map(function (x) { return String(x).trim(); }), dong: v.slice(dongTieuDe + 1) };
}

/** Tìm dòng tiêu đề (trong 15 dòng đầu) của tab kết quả — chấp nhận file Excel có dòng tiêu đề lớn phía trên. */
function docBangKetQua_(sh) {
  var lastRow = sh.getLastRow();
  for (var i = 0; i < Math.min(15, lastRow); i++) {
    var bang = docBang_(sh, i);
    var cMaHs = timCot_(bang.tieuDe, COT.MA_HS);
    var cTen = timCotTheoTen_(bang.tieuDe, TEN_GOI_KHAC_HO_TEN);
    if (cMaHs >= 0 || cTen >= 0) {
      bang.cMaHs = cMaHs;
      bang.cTen = cTen;
      bang.cLop = timCotTheoTen_(bang.tieuDe, TEN_GOI_KHAC_LOP);
      return bang;
    }
  }
  return null;
}

function layDanhSachHocSinh_(ss) {
  var sh = laySheetHocSinh_(ss);
  var bang = docBang_(sh, 0);
  var cMaHs = batBuocCot_(bang, COT.MA_HS, sh);
  var cMa = batBuocCot_(bang, COT.MA_TRA_CUU, sh);
  var cTen = timCotTheoTen_(bang.tieuDe, TEN_GOI_KHAC_HO_TEN);
  var cLop = timCotTheoTen_(bang.tieuDe, TEN_GOI_KHAC_LOP);
  return bang.dong.map(function (r) {
    return {
      maHs: String(r[cMaHs] || '').trim(),
      hoTen: cTen >= 0 ? String(r[cTen] || '').trim() : '',
      lop: cLop >= 0 ? String(r[cLop] || '').trim() : '',
      maTraCuu: String(r[cMa] || '').trim()
    };
  }).filter(function (hs) { return hs.maHs; });
}

/** Ghép 1 dòng kết quả với học sinh: ưu tiên Mã HS, nếu không có thì theo Họ tên (phải duy nhất). */
function ghepHocSinh_(dsHs, maHs, ten) {
  if (maHs) {
    var theoMa = dsHs.filter(function (h) { return h.maHs === maHs; });
    if (theoMa.length) return theoMa[0];
    if (!ten) return { loi: 'Mã HS "' + maHs + '" không có trong tab HocSinh' };
  }
  var k = chuanHoaTen_(ten);
  var theoTen = dsHs.filter(function (h) { return chuanHoaTen_(h.hoTen) === k; });
  if (theoTen.length === 1) return theoTen[0];
  if (theoTen.length > 1) return { loi: 'trùng tên với học sinh khác, cần thêm cột "Mã HS" vào tab kết quả' };
  return { loi: 'chưa có trong tab HocSinh' };
}

function timHocSinhTheoMa_(ss, ma) {
  var ds = layDanhSachHocSinh_(ss);
  for (var i = 0; i < ds.length; i++) {
    var m = chuanHoaMa_(ds[i].maTraCuu);
    if (m && m.length === CAU_HINH.DO_DAI_MA && m === ma) return ds[i];
  }
  return null;
}

/** Bảng điểm đơn giản từ các tab tên bắt đầu bằng "Điểm" (tab ẩn và cột "#..." không hiện). */
function layDiemCuaHocSinh_(ss, maHs) {
  var tienTo = chuanHoaTieuDe_(CAU_HINH.TIEN_TO_SHEET_DIEM);
  var ketQua = [];
  ss.getSheets().forEach(function (sh) {
    if (sh.isSheetHidden()) return;
    if (chuanHoaTieuDe_(sh.getName()).indexOf(tienTo) !== 0) return;
    var bang = docBang_(sh, 0);
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

function chuanHoaTieuDe_(s) {
  return String(s || '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Tên ô trộn: bỏ hoa/thường, coi "_" như dấu cách (Word đổi dấu cách thành "_" trong tên trường). */
function chuanHoaTruong_(s) {
  return String(s || '').normalize('NFC').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function chuanHoaTen_(s) {
  return chuanHoaTieuDe_(s);
}

function timCot_(tieuDe, ten) {
  var t = chuanHoaTieuDe_(ten);
  for (var i = 0; i < tieuDe.length; i++) if (chuanHoaTieuDe_(tieuDe[i]) === t) return i;
  return -1;
}

function timCotTheoTen_(tieuDe, dsTen) {
  for (var k = 0; k < dsTen.length; k++) {
    var i = timCot_(tieuDe, dsTen[k]);
    if (i >= 0) return i;
  }
  return -1;
}

function batBuocCot_(bang, ten, sh) {
  var i = timCot_(bang.tieuDe, ten);
  if (i < 0) throw new Error('Tab "' + sh.getName() + '" thiếu cột "' + ten + '".');
  return i;
}

function escapeRegex_(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeThayThe_(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\$/g, '\\$');
}

function chuanHoaMa_(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hienThiMa_(ma) {
  return ma.slice(0, 4) + '-' + ma.slice(4);
}

/** Mã ngẫu nhiên từ UUID (nguồn ngẫu nhiên an toàn) + SHA-256, không lệch phân phối. */
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
  return Number(CacheService.getScriptCache().get(khoaPhut_()) || 0) >= CAU_HINH.SO_LAN_SAI_TOI_DA_MOI_PHUT;
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
