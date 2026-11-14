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
 * BẢO MẬT
 *   - Hàm kết thúc bằng "_" là hàm riêng, trang web không gọi được.
 *   - Hàm cho phụ huynh: traCuu(), layPhieu() — luôn kiểm tra mã tra cứu.
 *   - Hàm cho giáo viên: gv...() — luôn gọi yeuCauGiaoVien_(), chỉ chạy khi người dùng
 *     là chính chủ file (từ trang công khai, người dùng ẩn danh nên bị từ chối).
 */

var CAU_HINH = {
  TIEU_DE_TRA_CUU: 'Tra cứu kết quả học tập',
  SHEET_HOC_SINH: 'HocSinh',
  SHEET_DOT: 'DotThi',
  SHEET_PHIEU: 'PhieuKetQua',
  THU_MUC_GOC: 'Phiếu kết quả học tập (tra cứu)',
  DO_DAI_MA: 8,
  KY_TU_MA: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // bỏ 0/O, 1/I/L
  SO_LAN_SAI_TOI_DA_MOI_PHUT: 30,
  // Thang điểm mặc định (dùng khi cột điểm trong file kết quả để trống)
  DIEM_CAU_PHAN_I: 0.25,
  DIEM_CAU_PHAN_III: 0.5,
  DIEM_PHAN_II_THEO_SO_Y_DUNG: [0, 0.1, 0.25, 0.5, 1] // 0,1,2,3,4 ý đúng
};

var COT_HS = ['Mã HS', 'Họ tên', 'Lớp', 'Ngày sinh', 'SĐT phụ huynh', 'Ghi chú', 'Mã tra cứu', 'Ngày tạo'];
var COT_DOT = ['Mã đợt', 'Tên đợt', 'Ngày tạo', 'Số phiếu', 'Công bố', 'Thư mục'];
var COT_PHIEU = ['Mã phiếu', 'Mã đợt', 'Mã HS', 'Họ tên', 'Tổng điểm', 'File ID', 'Thời gian'];

/* =====================================================================
 * 1. TRANG WEB
 * ===================================================================== */

function doGet() {
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
  var html = HtmlService.createTemplateFromFile('GiaoVien').evaluate().setWidth(1150).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'Quản lý kết quả học tập');
}

/* =====================================================================
 * 2. PHỤ HUYNH TRA CỨU
 * ===================================================================== */

function traCuu(maNhap) {
  return chayVoiMa_(maNhap, function (ss, hs) {
    return {
      ok: true,
      hocSinh: { hoTen: hs.hoTen, lop: hs.lop },
      phieu: phieuDaCongBo_(ss, hs.maHs).map(function (p) {
        return { maPhieu: p.maPhieu, tenDot: p.tenDot, tongDiem: p.tongDiem, ngay: p.ngay };
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

function phieuDaCongBo_(ss, maHs) {
  var congBo = {};
  dsDot_(ss).forEach(function (d) { if (d.congBo) congBo[d.maDot] = d.tenDot; });
  return dsPhieu_(ss)
    .filter(function (p) { return p.maHs === maHs && congBo[p.maDot] !== undefined; })
    .map(function (p) { p.tenDot = congBo[p.maDot]; return p; })
    .sort(function (a, b) { return b.thoiGian - a.thoiGian; });
}

/* =====================================================================
 * 3. GIÁO VIÊN — DỮ LIỆU CHUNG & CÀI ĐẶT
 * ===================================================================== */

function yeuCauGiaoVien_() {
  var nguoiDung = Session.getActiveUser().getEmail();
  var chuSoHuu = Session.getEffectiveUser().getEmail();
  if (!nguoiDung || nguoiDung !== chuSoHuu) throw new Error('Không có quyền thực hiện thao tác này.');
}

function gvTaiDuLieu() {
  yeuCauGiaoVien_();
  var ss = laySpreadsheet_();
  khoiTao_(ss);
  var demPhieu = {};
  dsPhieu_(ss).forEach(function (p) { demPhieu[p.maDot] = (demPhieu[p.maDot] || 0) + 1; });
  var linkMacDinh = '';
  try { linkMacDinh = ScriptApp.getService().getUrl() || ''; } catch (e) { /* chưa triển khai */ }
  var cd = layCaiDat_();
  return {
    hocSinh: dsHocSinh_(ss).map(function (h) { delete h.dong; return h; }),
    dot: dsDot_(ss).map(function (d) {
      return { maDot: d.maDot, tenDot: d.tenDot, ngayTao: d.ngayTao, soPhieu: demPhieu[d.maDot] || 0, congBo: d.congBo, thuMuc: d.thuMuc };
    }).reverse(),
    caiDat: cd,
    linkTraCuu: cd.linkTraCuu || linkMacDinh
  };
}

function gvLuuCaiDat(cd) {
  yeuCauGiaoVien_();
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
    var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
    var ds = dsHocSinh_(ss);
    var duLieu = [hoTen, chuoi_(hs.lop), chuoi_(hs.ngaySinh), chuoi_(hs.sdt), chuoi_(hs.ghiChu)];
    if (hs.maHs) {
      var cu = ds.filter(function (h) { return h.maHs === hs.maHs; })[0];
      if (!cu) throw new Error('Không tìm thấy học sinh ' + hs.maHs + '.');
      sh.getRange(cu.dong, 2, 1, 5).setValues([duLieu]);
    } else {
      themHocSinhVaoSheet_(sh, ds, [duLieu]);
    }
    return gvTaiDuLieu();
  });
}

/** Thêm nhiều học sinh từ bảng 2 chiều (dán từ Excel hoặc đọc file Excel). Bỏ qua em đã có (trùng tên + lớp). */
function gvThemNhieuHocSinh(bang) {
  yeuCauGiaoVien_();
  bang = (bang || []).map(function (r) { return (r || []).map(chuoi_); });
  // Tìm dòng tiêu đề; nếu không có thì coi cột 1 = Họ tên, 2 = Lớp, 3 = SĐT phụ huynh, 4 = Ngày sinh
  var c = { ten: 0, lop: 1, sdt: 2, ngaySinh: 3, ghiChu: -1 }, batDau = 0;
  for (var i = 0; i < Math.min(15, bang.length); i++) {
    var k = bang[i].map(khongDau_);
    var cTen = timChiSo_(k, ['hoten', 'hovaten', 'tenhocsinh', 'hotenhocsinh']);
    if (cTen >= 0) {
      c = { ten: cTen, lop: timChiSo_(k, ['lop', 'loptoan', 'lophoc']), sdt: timChiSo_(k, ['sdtphuhuynh', 'sdt', 'sodienthoai', 'dienthoai', 'sdtph']),
        ngaySinh: timChiSo_(k, ['ngaysinh']), ghiChu: timChiSo_(k, ['ghichu']) };
      batDau = i + 1;
      break;
    }
  }
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
    var ds = dsHocSinh_(ss);
    var daCo = {};
    ds.forEach(function (h) { daCo[khongDau_(h.hoTen) + '|' + khongDau_(h.lop)] = true; });
    var them = [], boQua = 0;
    bang.slice(batDau).forEach(function (r) {
      var ten = (r[c.ten] || '').replace(/\s+/g, ' ').trim();
      if (!ten) return;
      var lop = c.lop >= 0 ? r[c.lop] || '' : '';
      var key = khongDau_(ten) + '|' + khongDau_(lop);
      if (daCo[key]) { boQua++; return; }
      daCo[key] = true;
      them.push([ten, lop, c.ngaySinh >= 0 ? r[c.ngaySinh] || '' : '', c.sdt >= 0 ? r[c.sdt] || '' : '', c.ghiChu >= 0 ? r[c.ghiChu] || '' : '']);
    });
    themHocSinhVaoSheet_(sh, ds, them);
    var kq = gvTaiDuLieu();
    kq.thongBao = 'Đã thêm ' + them.length + ' học sinh' + (boQua ? ', bỏ qua ' + boQua + ' em đã có trong danh sách' : '') + '.';
    return kq;
  });
}

function gvXoaHocSinh(maHs) {
  yeuCauGiaoVien_();
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var hs = dsHocSinh_(ss).filter(function (h) { return h.maHs === maHs; })[0];
    if (hs) ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH).deleteRow(hs.dong);
    return gvTaiDuLieu();
  });
}

function gvCapLaiMa(maHs) {
  yeuCauGiaoVien_();
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var ds = dsHocSinh_(ss);
    var hs = ds.filter(function (h) { return h.maHs === maHs; })[0];
    if (!hs) throw new Error('Không tìm thấy học sinh.');
    var daDung = {};
    ds.forEach(function (h) { daDung[chuanHoaMa_(h.maTraCuu)] = true; });
    ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH).getRange(hs.dong, 7).setValue(hienThiMa_(taoMaKhongTrung_(daDung)));
    return gvTaiDuLieu();
  });
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
  yeuCauGiaoVien_();
  var nguon;
  try { nguon = SpreadsheetApp.openByUrl(String(url).trim()); }
  catch (e) { throw new Error('Không mở được link. Kiểm tra lại link và quyền truy cập của bạn với file đó.'); }
  var so = {};
  nguon.getSheets().forEach(function (s) {
    so[s.getName()] = s.getLastRow() ? s.getDataRange().getDisplayValues() : [];
  });
  return so;
}

/** Bước 1: đọc + chấm thử, ghép với danh sách học sinh, kèm HTML xem trước phiếu đầu tiên. */
function gvXemTruoc(so) {
  yeuCauGiaoVien_();
  var ss = laySpreadsheet_();
  khoiTao_(ss);
  var kq = phanTichFile_(so);
  if (!kq.ok) return kq;
  var ghep = ghepDanhSach_(kq.hocSinh, dsHocSinh_(ss));
  var dauTien = null;
  var dsXem = kq.hocSinh.map(function (h, i) {
    var g = ghep[i];
    var cham = chamBai_(kq, h);
    if (!dauTien && !g.loi) dauTien = { h: h, cham: cham, hs: g.hs || { hoTen: h.hoTen, lop: h.lop } };
    return { stt: h.stt, hoTen: h.hoTen, lop: h.lop, maDe: h.maDe, tongDiem: cham.diem.tong, maxTong: cham.diem.maxTong,
      trangThai: g.loi ? 'loi' : (g.hs ? 'co' : 'moi'), loi: g.loi || '', maHs: g.hs ? g.hs.maHs : '' };
  });
  return {
    ok: true,
    tieuDe: kq.thongTin.tieuDe,
    soCau: { I: kq.cauHoi.I.length, II: kq.cauHoi.II.length, III: kq.cauHoi.III.length },
    canhBao: kq.canhBao,
    hocSinh: dsXem,
    trungTen: dsDot_(ss).some(function (d) { return khongDau_(d.tenDot) === khongDau_(kq.thongTin.tieuDe); }),
    htmlXemTruoc: dauTien ? taoHtmlPhieu_(kq, dauTien.h, dauTien.cham, dauTien.hs, '(xem trước)', layLogo_()) : ''
  };
}

/** Bước 2: tạo đợt thi (thêm học sinh mới nếu chọn), trả về danh sách dòng cần tạo phiếu. */
function gvBatDauDot(so, tenDot, themHsMoi, ghiDe) {
  yeuCauGiaoVien_();
  tenDot = String(tenDot || '').trim();
  if (!tenDot) throw new Error('Vui lòng nhập tên đợt thi.');
  var kq = phanTichFile_(so);
  if (!kq.ok) return kq;
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    khoiTao_(ss);
    var trung = dsDot_(ss).filter(function (d) { return khongDau_(d.tenDot) === khongDau_(tenDot); });
    if (trung.length && !ghiDe) return { ok: false, canXacNhan: true, loi: 'Đã có đợt thi "' + trung[0].tenDot + '". Gửi lại sẽ thay thế toàn bộ phiếu cũ của đợt này.' };
    trung.forEach(function (d) { xoaDot_(ss, d.maDot); });

    // Thêm học sinh mới
    var shHs = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
    var ghep = ghepDanhSach_(kq.hocSinh, dsHocSinh_(ss));
    if (themHsMoi) {
      var moi = [];
      kq.hocSinh.forEach(function (h, i) {
        if (!ghep[i].loi && !ghep[i].hs) {
          var d = [h.hoTen, h.lop, '', '', ''];
          if (h.maHs) d.maHs = h.maHs;
          moi.push(d);
        }
      });
      themHocSinhVaoSheet_(shHs, dsHocSinh_(ss), moi);
      ghep = ghepDanhSach_(kq.hocSinh, dsHocSinh_(ss));
    }

    var maDot = 'D' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyMMddHHmmss');
    var goc = layThuMucGoc_();
    var thuMuc = goc.createFolder(tenDot + ' (' + maDot + ')');
    ss.getSheetByName(CAU_HINH.SHEET_DOT).appendRow([maDot, tenDot, new Date(), 0, false, thuMuc.getUrl()]);

    var canTao = [], boQua = [];
    kq.hocSinh.forEach(function (h, i) {
      if (ghep[i].hs) canTao.push(i);
      else boQua.push((h.hoTen || h.maHs) + ': ' + (ghep[i].loi || 'chưa có trong danh sách học sinh'));
    });
    return { ok: true, maDot: maDot, canTao: canTao, boQua: boQua, thuMuc: thuMuc.getUrl() };
  });
}

/** Bước 3: tạo phiếu PDF cho 1 lô học sinh (gọi nhiều lần để tránh giới hạn 6 phút). */
function gvTaoPhieuLo(maDot, so, dsChiSo) {
  yeuCauGiaoVien_();
  var ss = laySpreadsheet_();
  var dot = dsDot_(ss).filter(function (d) { return d.maDot === maDot; })[0];
  if (!dot) throw new Error('Không tìm thấy đợt thi.');
  var kq = phanTichFile_(so);
  if (!kq.ok) throw new Error(kq.loi);
  var ghep = ghepDanhSach_(kq.hocSinh, dsHocSinh_(ss));
  var thuMuc = DriveApp.getFolderById(layIdTuLink_(dot.thuMuc));
  var logo = layLogo_();
  var dongMoi = [], loi = [];

  (dsChiSo || []).forEach(function (i) {
    var h = kq.hocSinh[i], g = ghep[i];
    if (!h || !g || !g.hs) { loi.push((h && h.hoTen) + ': chưa có trong danh sách học sinh'); return; }
    try {
      var cham = chamBai_(kq, h);
      var maPhieu = maDot + '-' + g.hs.maHs;
      var html = taoHtmlPhieu_(kq, h, cham, g.hs, maPhieu, logo);
      var ten = dot.tenDot + ' - ' + g.hs.hoTen + ' - ' + g.hs.maHs;
      var pdf = thuMuc.createFile(Utilities.newBlob(html, MimeType.HTML, ten + '.html').getAs(MimeType.PDF).setName(ten + '.pdf'));
      dongMoi.push([maPhieu, maDot, g.hs.maHs, g.hs.hoTen, cham.diem.tong, pdf.getId(), new Date()]);
    } catch (e) {
      loi.push(h.hoTen + ': ' + e.message);
    }
  });

  voiKhoa_(function () {
    var sh = ss.getSheetByName(CAU_HINH.SHEET_PHIEU);
    if (dongMoi.length) sh.getRange(sh.getLastRow() + 1, 1, dongMoi.length, COT_PHIEU.length).setValues(dongMoi);
    var tong = dsPhieu_(ss).filter(function (p) { return p.maDot === maDot; }).length;
    ss.getSheetByName(CAU_HINH.SHEET_DOT).getRange(dot.dong, 4).setValue(tong);
  });
  return { xong: dongMoi.length, loi: loi };
}

function gvCongBo(maDot, congBo) {
  yeuCauGiaoVien_();
  return voiKhoa_(function () {
    var ss = laySpreadsheet_();
    var d = dsDot_(ss).filter(function (x) { return x.maDot === maDot; })[0];
    if (d) ss.getSheetByName(CAU_HINH.SHEET_DOT).getRange(d.dong, 5).setValue(!!congBo);
    return gvTaiDuLieu();
  });
}

function gvXoaDot(maDot) {
  yeuCauGiaoVien_();
  return voiKhoa_(function () {
    xoaDot_(laySpreadsheet_(), maDot);
    return gvTaiDuLieu();
  });
}

function xoaDot_(ss, maDot) {
  var shP = ss.getSheetByName(CAU_HINH.SHEET_PHIEU);
  var v = shP.getDataRange().getValues();
  for (var i = v.length - 1; i >= 1; i--) {
    if (String(v[i][1]) !== maDot) continue;
    try { DriveApp.getFileById(String(v[i][5])).setTrashed(true); } catch (e) { /* đã xóa */ }
    shP.deleteRow(i + 1);
  }
  var d = dsDot_(ss).filter(function (x) { return x.maDot === maDot; })[0];
  if (d) {
    try { DriveApp.getFolderById(layIdTuLink_(d.thuMuc)).setTrashed(true); } catch (e) { /* đã xóa */ }
    ss.getSheetByName(CAU_HINH.SHEET_DOT).deleteRow(d.dong);
  }
}

/** Tạo file mẫu kết quả thi (Google Sheet) trong Drive — giáo viên có thể tải về dạng Excel. */
function gvTaoFileMau() {
  yeuCauGiaoVien_();
  var f = SpreadsheetApp.create('Mẫu kết quả thi');
  var mau = MAU_FILE_KET_QUA;
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
      chiSo: hocSinh.length, stt: lay(r, ck.stt), maHs: maHs, hoTen: ten, lop: lay(r, ck.lop), maDe: lay(r, ck.maDe),
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

function taoHtmlPhieu_(kq, h, cham, hs, maPhieu, logo) {
  var cd = layCaiDat_();
  var t = HtmlService.createTemplateFromFile('Phieu');
  t.d = {
    trungTam: cd.tenTrungTam || '', khauHieu: cd.khauHieu || '', logo: logo || '',
    tieuDe: kq.thongTin.tieuDe, moTa: kq.thongTin.moTa, nhanLop: kq.thongTin.nhanLop,
    tenPhan: kq.thongTin.tenPhan, moTaPhan: kq.thongTin.moTaPhan,
    stt: h.stt, hoTen: hs.hoTen || h.hoTen, lop: h.lop || hs.lop || '', maDe: h.maDe,
    cham: cham, nhanXet: h.nhanXet, maPhieu: maPhieu,
    ngay: Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy')
  };
  return t.evaluate().getContent();
}

/** Ghép từng dòng kết quả với danh sách học sinh. Trả về [{hs} | {loi} | {} (học sinh mới)]. */
function ghepDanhSach_(dsKq, dsHs) {
  var daGap = {};
  return dsKq.map(function (h) {
    var r = {};
    if (h.maHs) {
      var theoMa = dsHs.filter(function (x) { return x.maHs === h.maHs; });
      if (theoMa.length) r.hs = theoMa[0];
    }
    if (!r.hs && h.hoTen) {
      var ten = khongDau_(h.hoTen);
      var theoTen = dsHs.filter(function (x) { return khongDau_(x.hoTen) === ten; });
      if (theoTen.length > 1 && h.lop) {
        theoTen = theoTen.filter(function (x) { return khongDau_(x.lop) === khongDau_(h.lop); });
      }
      if (theoTen.length === 1) r.hs = theoTen[0];
      else if (theoTen.length > 1) r.loi = 'Trùng họ tên với học sinh khác, hãy điền cột "Mã HS"';
    }
    var khoa = r.hs ? 'ma:' + r.hs.maHs : 'ten:' + khongDau_(h.hoTen) + '|' + khongDau_(h.lop);
    if (!r.loi && daGap[khoa]) r = { loi: 'Học sinh xuất hiện 2 lần trong file' };
    daGap[khoa] = true;
    return r;
  });
}

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
  [[CAU_HINH.SHEET_HOC_SINH, COT_HS], [CAU_HINH.SHEET_DOT, COT_DOT], [CAU_HINH.SHEET_PHIEU, COT_PHIEU]].forEach(function (x) {
    if (ss.getSheetByName(x[0])) return;
    var sh = ss.insertSheet(x[0]);
    if (x[0] === CAU_HINH.SHEET_HOC_SINH) sh.getRange('A:H').setNumberFormat('@');
    sh.getRange(1, 1, 1, x[1].length).setValues([x[1]]).setFontWeight('bold').setBackground('#e8f0fe');
    sh.setFrozenRows(1);
    sh.protect().setDescription('Dữ liệu hệ thống — nên sửa qua bảng điều khiển').setWarningOnly(true);
  });
}

function dsHocSinh_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_HOC_SINH);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COT_HS.length).getDisplayValues().map(function (r, i) {
    return { dong: i + 2, maHs: r[0].trim(), hoTen: r[1].trim(), lop: r[2].trim(), ngaySinh: r[3].trim(), sdt: r[4].trim(),
      ghiChu: r[5].trim(), maTraCuu: r[6].trim(), ngayTao: r[7].trim() };
  }).filter(function (h) { return h.maHs; });
}

function dsDot_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_DOT);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COT_DOT.length).getValues().map(function (r, i) {
    return { dong: i + 2, maDot: String(r[0]).trim(), tenDot: String(r[1]).trim(),
      ngayTao: r[2] && r[2].getTime ? Utilities.formatDate(r[2], 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') : String(r[2]),
      soPhieu: Number(r[3]) || 0, congBo: r[4] === true || String(r[4]).toUpperCase() === 'TRUE', thuMuc: String(r[5]) };
  }).filter(function (d) { return d.maDot; });
}

function dsPhieu_(ss) {
  var sh = ss.getSheetByName(CAU_HINH.SHEET_PHIEU);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COT_PHIEU.length).getValues().map(function (r) {
    var tg = r[6] && r[6].getTime ? r[6] : null;
    return { maPhieu: String(r[0]), maDot: String(r[1]), maHs: String(r[2]).trim(), hoTen: String(r[3]),
      tongDiem: String(r[4]), fileId: String(r[5]), thoiGian: tg ? tg.getTime() : 0,
      ngay: tg ? Utilities.formatDate(tg, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy') : '' };
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
    ['Nhãn lớp', 'Lớp toán', 'Chữ hiển thị trước tên lớp trên phiếu'],
    ['Điểm mỗi câu phần I', '0.25', 'Dùng khi cột "Điểm phần I" để trống'],
    ['Điểm mỗi câu phần III', '0.5', 'Dùng khi cột "Điểm phần III" để trống và có nhập câu trả lời phần III'],
    ['Mô tả phần I', 'Phần này gồm 12 câu hỏi trắc nghiệm khách quan, các câu hỏi ở mức độ 1.', ''],
    ['Mô tả phần II', 'Phần này gồm 4 câu hỏi. Mỗi câu hỏi gồm 4 ý (a, b, c, d), yêu cầu học sinh phải nắm vững bản chất vấn đề và xét tính đúng/sai của từng mệnh đề độc lập.', ''],
    ['Mô tả phần III', 'Phần này gồm 6 câu hỏi, đòi hỏi tư duy cao hơn. Học sinh phải tự giải quyết bài toán và điền đáp án cuối cùng.', '']
  ],
  HuongDan: [
    ['HƯỚNG DẪN ĐIỀN FILE KẾT QUẢ'],
    ['• Tab KetQua: mỗi học sinh 1 dòng. Bắt buộc có "Họ và tên" (nên có "Mã HS" lấy từ danh sách học sinh để tránh trùng tên).'],
    ['• Cột I.1 … I.12: đáp án học sinh chọn ở phần I (A/B/C/D).'],
    ['• Cột II.1 … II.4: đáp án đúng/sai của 4 ý, viết "Đ,S,Đ,S" hoặc "ĐSĐS".'],
    ['• Cột III.1 … III.6: đáp số học sinh điền (có thể để trống nếu chấm tay và nhập thẳng "Điểm phần III").'],
    ['• Cột điểm để trống thì hệ thống tự tính: phần I 0,25đ/câu; phần II theo số ý đúng (1 ý 0,1 – 2 ý 0,25 – 3 ý 0,5 – 4 ý 1đ); phần III 0,5đ/câu.'],
    ['• Muốn thêm/bớt câu: thêm/xóa cột trong KetQua (vd I.13) và dòng tương ứng trong DeThi.'],
    ['• Tab DeThi: chủ đề, nội dung và đáp án đúng của từng câu. Nhiều mã đề: thêm cột "Đáp án mã 106", "Đáp án mã 107"…'],
    ['• Nhận xét (Ưu điểm, Nhược điểm, Hướng khắc phục, Lời khuyên) để trống thì phiếu sẽ bỏ qua mục đó (Lời khuyên có câu mặc định).']
  ]
};
