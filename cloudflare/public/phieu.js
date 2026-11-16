/**
 * Dựng phiếu kết quả (HTML đầy đủ) từ dữ liệu đã chấm. Dùng chung cho trang phụ huynh và trang giáo viên.
 * renderPhieu(d, logo) -> chuỗi HTML (đặt vào iframe srcdoc).  Bố cục mẫu mặc định "Kết quả kiểm tra"; các phần theo cấu trúc đề (khoi-phieu.js).
 */
(function (goc) {
  function e(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var CSS = [
    "body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#000;margin:0;padding:18px 22px;background:#fff}",
    'table{border-collapse:collapse}',
    '.dau{width:100%;margin-bottom:6px}.dau td{vertical-align:middle;border:0}',
    '.trung-tam{text-align:center;color:#1b7a34;font-weight:bold;font-size:13pt}.khau-hieu{text-align:center;color:#1b7a34;font-size:8pt}',
    '.tieu-de{text-align:center;font-weight:bold;font-size:14pt}.mo-ta{text-align:center;font-weight:bold;font-style:italic}.stt{text-align:center;font-weight:bold}',
    'h3{font-size:12pt;margin:10px 0 4px}.ke{border-top:1.5px solid #000;margin:4px 0 6px}',
    '.tt td{padding:2px 4px;border:0}',
    '.bang{width:100%;margin:4px 0 8px}.bang th,.bang td{border:1px solid #000;padding:3px 5px;font-size:11pt;vertical-align:middle}.bang th{font-weight:bold;text-align:center}',
    '.giua{text-align:center}.nho{font-size:10.5pt}.nd{white-space:pre-line}',
    '.do{color:#d40000;font-weight:bold}.xanh{color:#00a040;font-weight:bold}.nx{color:#d40000;font-weight:bold;font-style:italic}',
    '.chan-trang{margin-top:14px;font-size:9pt;color:#555;text-align:right}p{margin:3px 0}',
    '@media (max-width:600px){body{padding:10px}.bang th,.bang td{font-size:10pt;padding:2px 3px}.nho{font-size:9.5pt}.tt td{display:block;width:auto}.dau td{display:block;width:auto!important}}'
  ].join('\n');

  function chuDeO(q) { return e(q.chuDe) + (q.mucDo ? '<br>(' + e(q.mucDo) + ')' : ''); }

  /* Phiếu theo mẫu Word: máy chủ đã điền sẵn (d.htmlMau). Bề rộng cố định theo khổ giấy Word -> màn hình hẹp thu nhỏ (zoom) cho vừa. */
  function renderMauWord(d) {
    var tr = d.trangMau || {}, rong = Math.round((tr.rongToiDa || ((tr.rong || 595) - (tr.trai || 72) - (tr.phai || 72))) * 96 / 72) + 28; // pt -> px + lề trang web
    var css = ["body{margin:0;padding:12px;background:#fff;color:#000}", '#phieu{width:max-content;max-width:none}', '.mau-word table{page-break-inside:auto}.mau-word tr{page-break-inside:avoid}',
      '.ngat-trang{display:block;break-before:page}', '.truong{background:#FFF1B8;border-radius:2px;outline:1px dashed #C9A227}'];
    // mỗi nấc áp dụng cho bề rộng (w-20, w] -> tính theo cận dưới w-20, trừ lề trang web 24px (padding body) + 4px dư
    var noi = rong - 28;
    for (var w = rong; w >= 280; w -= 20) css.push('@media (max-width:' + w + 'px){#phieu{zoom:' + (Math.floor((w - 20 - 28) / noi * 1000) / 1000) + '}}');
    return '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css.join('\n') +
      '</style></head><body><div id="phieu">' + d.htmlMau + '</div></body></html>';
  }

  /* Bảng phân tích 1 phần (Câu – Chủ đề – Nội dung – Đáp án của bạn – Đáp án đúng), kiểu bảng theo DẠNG BÀI.
     Dùng chung cho mẫu mặc định và kiểu "Bài kiểm tra"; cần CSS .bang .giua .nho .nd .do .xanh. */
  function veBangPhan(h, d, p, muc, KP) {
    var tieuDeBang = function (them) {
      return '<tr><th style="width:6%">Câu</th><th style="width:22%">Chủ đề kiến thức</th><th>Nội dung phân tích cụ thể</th>' + them + '</tr>';
    };
      var moTa = d.moTaPhan && d.moTaPhan[p.ma], dang = p.dang, cot;
      h.push('<p><b>' + muc + '. PHẦN ' + e(p.ma) + ': ' + e(KP.tieuDePhan(d, p)) + '</b></p>' + (moTa ? '<p>' + e(moTa) + '</p>' : ''));
      if (dang === 'dung_sai') {
        h.push('<table class="bang">' + tieuDeBang('<th style="width:12%">Đáp án<br>của bạn</th><th style="width:10%">Đáp án<br>đúng</th>'));
        p.cau.forEach(function (q) {
          var o = (q.kyTu || []).length ? q.kyTu.map(function (k, i) { return (i ? ',' : '') + '<span class="' + (k.ok ? 'xanh' : 'do') + '">' + e(k.c) + '</span>'; }).join('') : '<span class="do">—</span>';
          h.push('<tr><td class="giua">' + e(q.cau) + '</td><td>' + chuDeO(q) + '</td><td class="nho nd">' + e(q.noiDung) + '</td>' +
            '<td class="giua">' + o + '</td><td class="giua xanh">' + e(q.dung) + '</td></tr>');
        });
        h.push('<tr><td colspan="3" class="giua"><b>Tổng điểm</b></td><td class="giua do">' + e(p.diem) + '</td><td></td></tr></table>');
      } else if (dang === 'tu_luan') {
        cot = p.cau.some(function (q) { return q.hs; });
        h.push('<table class="bang">' + tieuDeBang((cot ? '<th style="width:12%">Đáp án<br>của bạn</th>' : '') + '<th style="width:12%">Đáp số</th>'));
        p.cau.forEach(function (q) {
          h.push('<tr><td class="giua">' + e(q.cau) + '</td><td>' + chuDeO(q) + '</td><td class="nho">' + e(q.noiDung) + '</td>' +
            (cot ? '<td class="giua ' + (q.ok ? 'xanh' : 'do') + '">' + e(q.hs || '—') + '</td>' : '') + '<td class="giua xanh">' + e(q.dung) + '</td></tr>');
        });
        h.push('<tr><td colspan="' + (cot ? 4 : 3) + '" class="giua"><b>Tổng điểm của bạn</b></td><td class="giua do">' + e(p.diem) + '/' + e(p.toiDa) + '</td></tr></table>');
      } else {
        // Trắc nghiệm ABCD (giữ đúng bố cục v1); Trả lời ngắn / Điền từ / Sắp xếp: cùng kiểu, hệ thống tự chấm
        var rong = dang === 'trac_nghiem' ? '10%' : '12%';
        h.push('<table class="bang">' + tieuDeBang('<th style="width:' + rong + '">Đáp án<br>của bạn</th><th style="width:' + rong + '">' + (dang === 'tra_loi_ngan' ? 'Đáp số' : 'Đáp án<br>đúng') + '</th>'));
        p.cau.forEach(function (q) {
          h.push('<tr><td class="giua">' + e(q.cau) + '</td><td>' + chuDeO(q) + '</td><td class="nho">' + e(q.noiDung) + '</td>' +
            '<td class="giua ' + (q.ok ? 'xanh' : 'do') + '">' + e(q.hs || '—') + '</td><td class="giua xanh">' + e(q.dung) + '</td></tr>');
        });
        h.push('<tr><td colspan="3" class="giua"><b>Tổng điểm</b></td><td class="giua do">' + e(p.diem) + '</td><td></td></tr></table>');
      }
      }

  /* Kiểu "Bài kiểm tra": trình bày như tờ giấy thi — đầu phiếu (trường, bài kiểm tra, thông tin học sinh), khung Điểm / Nhận xét,
     phân tích bài làm (bảng giống mẫu mặc định), kết quả theo chủ đề. Các phần lấy theo cấu trúc đề (khoi-phieu.js). */
  var CSS_BKT = [
    "body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#000;margin:0;padding:18px 22px;background:#fff}",
    'table{border-collapse:collapse}p{margin:3px 0}',
    '.dau{width:100%}.dau td{vertical-align:top;border:0;padding:0 4px}',
    '.truong{font-weight:bold;text-align:center;text-transform:uppercase}.logo{text-align:center;margin-bottom:4px}',
    '.tieu-de{font-weight:bold;text-transform:uppercase;font-size:13pt}',
    '.dong{margin:4px 0;white-space:nowrap}.cham{border-bottom:1px dotted #000;padding:0 6px;font-weight:bold;color:#d40000}',
    '.o-ma{display:inline-block;min-width:64px;border:1px solid #000;padding:2px 8px;text-align:center;font-weight:bold;color:#d40000;vertical-align:middle}',
    '.cat{border-top:1.5px dashed #555;margin:10px 0 8px}',
    '.khung{width:100%;margin-bottom:6px}.khung th,.khung td{border:1px solid #000;padding:4px 6px;vertical-align:top}.khung th{text-align:center;font-weight:bold}',
    '.diem-lon{font-size:26pt;font-weight:bold;color:#d40000;text-align:center;line-height:1.1}.diem-lon small{font-size:12pt;color:#000}',
    '.bang-chu{text-align:center;font-style:italic;font-size:10.5pt}',
    '.phan-diem{font-size:11pt;margin:1px 0}.phan-diem b{color:#d40000}',
    '.nhan-xet{font-size:11pt;font-style:italic}',
    '.bai-lam{text-align:center;font-weight:bold;text-decoration:underline;margin:8px 0 4px}',
    'h4{font-size:12pt;margin:8px 0 3px}',
    '.dung{color:#00a040;font-weight:bold}.sai{color:#d40000;font-weight:bold}',
    // bảng phân tích dùng chung với mẫu mặc định
    '.bang{width:100%;margin:4px 0 8px}.bang th,.bang td{border:1px solid #000;padding:3px 5px;font-size:11pt;vertical-align:middle}.bang th{font-weight:bold;text-align:center}',
    '.giua{text-align:center}.nho{font-size:10.5pt}.nd{white-space:pre-line}.do{color:#d40000;font-weight:bold}.xanh{color:#00a040;font-weight:bold}',
    '.cd{width:100%;margin:2px 0 6px}.cd th,.cd td{border:1px solid #000;padding:3px 5px;font-size:11pt}.cd th{background:#f2f2f2}',
    '.chan-trang{margin-top:10px;font-size:9pt;color:#555;text-align:right}',
    '@media (max-width:600px){body{padding:10px}.dau td{display:block;width:auto!important}.dong{white-space:normal}.bang th,.bang td{font-size:10pt;padding:2px 3px}}'
  ].join('\n');

  // Đọc điểm thành chữ: 7.25 -> "Bảy phẩy hai lăm"
  function diemBangChu(x) {
    var n = parseFloat(x); if (isNaN(n)) return '';
    var SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    var doc2 = function (k) { // 0..99
      if (k < 10) return SO[k];
      var c = Math.floor(k / 10), dv = k % 10, t = (c === 1 ? 'mười' : SO[c] + ' mươi');
      if (!dv) return t;
      return t + ' ' + (dv === 5 ? 'lăm' : dv === 1 && c > 1 ? 'mốt' : dv === 4 && c > 1 ? 'tư' : SO[dv]);
    };
    var nguyen = Math.floor(n + 1e-9), le = Math.round((n - nguyen) * 100);
    var s = doc2(nguyen);
    if (le) s += ' phẩy ' + (le % 10 ? (le < 10 ? 'không ' + SO[le] : doc2(le)) : SO[le / 10]);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function renderBaiKiemTra(d, logo, KP) {
    var c = d.cham, dm = c.diem || {}, nx = d.nhanXet || {}, h = [];
    var dsPhan = KP.cacPhan(c).filter(function (p) { return (p.cau || []).length; });
    h.push('<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + CSS_BKT + '</style></head><body><div id="phieu">');
    // Đầu phiếu
    var mon = c.cauTruc && c.cauTruc.mon;
    h.push('<table class="dau"><tr><td style="width:46%">');
    if (logo) h.push('<div class="logo"><img src="' + e(logo) + '" alt="" style="max-height:56px;max-width:160px"></div>');
    h.push('<div class="truong">' + e(d.trungTam || 'Trung tâm') + '</div>');
    h.push('<p class="dong">Họ và tên: <span class="cham">' + e(d.hoTen) + '</span></p>');
    h.push('<p class="dong">SBD: <span class="cham">' + e(d.sbd || '…') + '</span> &nbsp; ' + e(d.nhanLop || 'Lớp') + ': <span class="cham">' + e(d.lop) + '</span></p>');
    h.push('<p class="dong">Ngày kiểm tra: <span class="cham">' + e(d.ngayThi || '…') + '</span>' + (d.lan > 1 || (d.lichSu || []).length ? ' &nbsp; Lần: <span class="cham">' + e(d.lan) + '</span>' : '') + '</p>');
    h.push('</td><td><div class="tieu-de">' + e(d.tieuDe) + '</div>');
    if (d.moTa) h.push('<p><i>' + e(d.moTa) + '</i></p>');
    if (mon) h.push('<p class="dong">Môn kiểm tra: <b>' + e(mon) + '</b></p>');
    h.push('<p class="dong">Cấu trúc: ' + dsPhan.map(function (p) { return 'Phần ' + e(p.ma) + ' – ' + p.cau.length + ' câu'; }).join('; ') + '</p>');
    h.push('<p class="dong">Mã đề: <span class="o-ma">' + e(d.maDe || '—') + '</span></p>');
    h.push('</td></tr></table><div class="cat"></div>');
    // Khung Điểm / Điểm từng phần / Nhận xét
    h.push('<table class="khung"><tr><th style="width:22%">Điểm</th><th style="width:30%">Điểm từng phần</th><th>Nhận xét của giáo viên</th></tr><tr>');
    h.push('<td><div class="diem-lon">' + e(dm.tong) + '<small>/' + e(dm.maxTong) + '</small></div><div class="bang-chu">(' + e(diemBangChu(dm.tong)) + ')</div>' +
      (d.thuHang ? '<p style="text-align:center;font-size:10.5pt">Xếp hạng: <b class="sai">' + e(d.thuHang) + '</b>' + (d.soXepHang ? ' / ' + e(d.soXepHang) : '') + '</p>' : '') + '</td>');
    h.push('<td>' + KP.dongDiemTuDong(c).map(function (x) { return '<p class="phan-diem">' + e(x.nhan) + ': <b>' + e(x.diem) + '</b>/' + e(x.toiDa) + '</p>'; }).join(''));
    if ((d.lichSu || []).length) h.push('<p class="phan-diem" style="margin-top:4px">So với lần trước: <b class="' + (d.tangDiem ? 'dung' : d.giamDiem ? 'sai' : '') + '">' + e(d.chenhLech) + '</b></p>');
    h.push('</td><td class="nhan-xet">');
    if (nx.uu) h.push('<p>+ Ưu điểm: ' + e(nx.uu) + '</p>');
    if (nx.nhuoc) h.push('<p>+ ' + e(nx.nhanNhuoc || 'Nhược điểm') + ': ' + e(nx.nhuoc) + '</p>');
    if (nx.khacPhuc) h.push('<p>+ Hướng khắc phục: ' + e(nx.khacPhuc) + '</p>');
    // Lời khuyên nằm luôn trong khung nhận xét (không nhắc lại ở cuối phiếu)
    h.push('<p>+ Lời khuyên: ' + (nx.loiKhuyen ? e(nx.loiKhuyen) : 'Em hãy ôn lại các chủ đề còn sai và phát huy những phần đã làm tốt. Chúc <b>' + e(d.hoTen) + '</b> đạt kết quả cao trong bài kiểm tra tiếp theo!') + '</p>');
    h.push('</td></tr></table>');
    // Phân tích bài làm: cùng bảng với mẫu mặc định (Câu – Chủ đề – Nội dung – Đáp án của bạn – Đáp án đúng)
    h.push('<div class="bai-lam">PHÂN TÍCH BÀI LÀM</div>');
    dsPhan.forEach(function (p, i) { veBangPhan(h, d, p, i + 1, KP); });
    // Thống kê theo chủ đề (câu chấm tự động): đúng / tổng, các câu sai
    var cd = {}, thuTu = [];
    dsPhan.forEach(function (p) {
      if (p.dang === 'tu_luan') return;
      p.cau.forEach(function (q) {
        var k = q.chuDe || '(Chưa ghi chủ đề)'; if (!cd[k]) { cd[k] = { dung: 0, tong: 0, sai: [] }; thuTu.push(k); }
        var ok = p.dang === 'dung_sai' ? (q.kyTu || []).length && q.kyTu.every(function (x) { return x.ok; }) : q.ok;
        cd[k].tong++; if (ok) cd[k].dung++; else cd[k].sai.push(p.ma + '.' + q.cau);
      });
    });
    if (thuTu.length) {
      thuTu.sort(function (a, b) { return cd[a].dung / cd[a].tong - cd[b].dung / cd[b].tong; });
      h.push('<h4>Kết quả theo chủ đề</h4><table class="cd"><tr><th style="text-align:left">Chủ đề kiến thức</th><th style="width:16%">Đúng / Tổng</th><th style="width:34%">Câu chưa đúng</th></tr>');
      thuTu.forEach(function (k) {
        var x = cd[k], tot = x.dung === x.tong;
        h.push('<tr><td>' + e(k) + '</td><td style="text-align:center" class="' + (tot ? 'dung' : x.dung * 2 < x.tong ? 'sai' : '') + '">' + x.dung + ' / ' + x.tong + '</td><td>' + (x.sai.length ? e(x.sai.join(', ')) : '<span class="dung">Đúng hết</span>') + '</td></tr>');
      });
      h.push('</table>');
    }
    h.push('<div class="chan-trang">Mã phiếu: ' + e(d.maPhieu) + ' · Ngày tạo: ' + e(d.ngay) + '</div></div></body></html>');
    return h.join('');
  }

  function renderPhieu(d, logo) {
    if (d.htmlMau) return renderMauWord(d);
    if (d.kieu === 'bai-kiem-tra' && goc.KhoiPhieu && goc.KhoiPhieu.cacPhan && d.cham) return renderBaiKiemTra(d, logo, goc.KhoiPhieu);
    var c = d.cham, dm = c.diem, nx = d.nhanXet || {}, h = [];
    h.push('<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + CSS + '</style></head><body>');
    h.push('<div id="phieu">');
    h.push('<table class="dau"><tr><td style="width:32%">');
    if (logo) h.push('<div style="text-align:center"><img src="' + e(logo) + '" alt="" style="max-height:70px;max-width:180px"></div>');
    if (d.trungTam) h.push('<div class="trung-tam">' + e(d.trungTam) + '</div>');
    if (d.khauHieu) h.push('<div class="khau-hieu">' + e(d.khauHieu) + '</div>');
    h.push('</td><td><div class="tieu-de">' + e(d.tieuDe) + '</div>');
    if (d.moTa) h.push('<div class="mo-ta">(' + e(d.moTa) + ')</div>');
    var dongPhu = [];
    if (d.stt) dongPhu.push('STT: ' + e(d.stt));
    if (d.lan > 1 || (d.lichSu || []).length) dongPhu.push('Lần ' + e(d.lan));
    if (d.ngayThi) dongPhu.push('Ngày thi: ' + e(d.ngayThi));
    if (dongPhu.length) h.push('<div class="stt">(' + dongPhu.join(' · ') + ')</div>');
    h.push('</td></tr></table>');

    // A. Thông tin chung
    var so = 1;
    h.push('<h3>A. THÔNG TIN CHUNG</h3><table class="tt" style="width:100%"><tr>');
    h.push('<td><b>' + (so++) + '. Họ và tên:</b> <span class="do">' + e(d.hoTen) + '</span></td>');
    h.push('<td><b>' + (so++) + '. ' + e(d.nhanLop || 'Lớp') + ':</b> <span class="do">' + e(d.lop) + '</span></td>');
    h.push('<td>' + (d.maDe ? '<b>' + (so++) + '. Mã đề thi:</b> <span class="do">' + e(d.maDe) + '</span>' : '') + '</td></tr>');
    if (d.sbd || d.thuHang) {
      h.push('<tr><td>' + (d.sbd ? '<b>' + (so++) + '. Số báo danh:</b> ' + e(d.sbd) : '') + '</td>');
      h.push('<td colspan="2">' + (d.thuHang ? '<b>' + (so++) + '. Xếp hạng:</b> <span class="do">' + e(d.thuHang) + '</span>' + (d.soXepHang ? ' / ' + e(d.soXepHang) : '') : '') + '</td></tr>');
    }
    // Các phần theo cấu trúc đề (khoi-phieu.js, dùng chung với mẫu tự tạo); chưa nạp được thì dùng 3 phần cố định như v1
    var KP = goc.KhoiPhieu && goc.KhoiPhieu.cacPhan ? goc.KhoiPhieu : null;
    var dsPhan = KP ? KP.cacPhan(c).filter(function (p) { return (p.cau || []).length; }) : null;
    h.push('<tr><td colspan="3"><b>' + (so++) + '. Kết quả cụ thể:</b> ');
    if (KP) KP.dongDiemTuDong(c).forEach(function (x) { h.push(e(x.nhan) + ': <span class="do">' + e(x.diem) + '</span>/' + e(x.toiDa) + '; '); });
    // phiếu mặc định v1: ghi theo loại câu (mục 3 = Tự luận) thay cho "Phần 1/2/3"
    else if (c.phan1.length) h.push('Trắc nghiệm: <span class="do">' + e(dm.p1) + '</span>/' + e(dm.max1) + '; ');
    if (!KP && c.phan2.length) h.push('Đúng sai: <span class="do">' + e(dm.p2) + '</span>/' + e(dm.max2) + '; ');
    if (!KP && c.phan3.length) h.push('Tự luận: <span class="do">' + e(dm.p3) + '</span>/' + e(dm.max3) + '; ');
    h.push('<b>Tổng điểm: <span class="do">' + e(dm.tong) + '</span>/' + e(dm.maxTong) + '</b></td></tr></table>');

    // Kết quả các lần làm trước
    if ((d.lichSu || []).length) {
      h.push('<table class="bang" style="width:auto;margin-top:6px"><tr><th>Kết quả các lần làm</th>');
      d.lichSu.forEach(function (x) { h.push('<th>Lần ' + e(x.lan) + (x.ngayThi ? '<br><span style="font-weight:normal;font-size:9.5pt">' + e(x.ngayThi) + '</span>' : '') + '</th>'); });
      h.push('<th>Lần ' + e(d.lan) + ' (lần này)' + (d.ngayThi ? '<br><span style="font-weight:normal;font-size:9.5pt">' + e(d.ngayThi) + '</span>' : '') + '</th><th>So với lần trước</th></tr>');
      h.push('<tr><td class="giua"><b>Tổng điểm</b></td>');
      d.lichSu.forEach(function (x) { h.push('<td class="giua">' + e(x.tong) + '</td>'); });
      h.push('<td class="giua do">' + e(dm.tong) + '</td><td class="giua ' + (d.tangDiem ? 'xanh' : d.giamDiem ? 'do' : '') + '">' + e(d.chenhLech) + (d.tangDiem ? ' ▲' : d.giamDiem ? ' ▼' : '') + '</td></tr></table>');
    }
    h.push('<div class="ke"></div><h3>B. PHÂN TÍCH BÀI THI</h3>');

    var muc = 0;
    var tieuDeBang = function (them) {
      return '<tr><th style="width:6%">Câu</th><th style="width:22%">Chủ đề kiến thức</th><th>Nội dung phân tích cụ thể</th>' + them + '</tr>';
    };
    // Mỗi phần 1 bảng, kiểu bảng theo DẠNG BÀI (không theo thứ tự phần)
    if (dsPhan) dsPhan.forEach(function (p) { muc++; veBangPhan(h, d, p, muc, KP); });
    if (!dsPhan && c.phan1.length) {
      muc++;
      h.push('<p><b>' + muc + '. PHẦN I: ' + e(d.tenPhan.I) + '</b></p>' + (d.moTaPhan.I ? '<p>' + e(d.moTaPhan.I) + '</p>' : ''));
      h.push('<table class="bang">' + tieuDeBang('<th style="width:10%">Đáp án<br>của bạn</th><th style="width:10%">Đáp án<br>đúng</th>'));
      c.phan1.forEach(function (q) {
        h.push('<tr><td class="giua">' + e(q.cau) + '</td><td>' + chuDeO(q) + '</td><td class="nho">' + e(q.noiDung) + '</td>' +
          '<td class="giua ' + (q.ok ? 'xanh' : 'do') + '">' + e(q.hs || '—') + '</td><td class="giua xanh">' + e(q.dung) + '</td></tr>');
      });
      h.push('<tr><td colspan="3" class="giua"><b>Tổng điểm</b></td><td class="giua do">' + e(dm.p1) + '</td><td></td></tr></table>');
    }
    if (!dsPhan && c.phan2.length) {
      muc++;
      h.push('<p><b>' + muc + '. PHẦN II: ' + e(d.tenPhan.II) + '</b></p>' + (d.moTaPhan.II ? '<p>' + e(d.moTaPhan.II) + '</p>' : ''));
      h.push('<table class="bang">' + tieuDeBang('<th style="width:12%">Đáp án<br>của bạn</th><th style="width:10%">Đáp án<br>đúng</th>'));
      c.phan2.forEach(function (q) {
        var o = q.kyTu.length ? q.kyTu.map(function (k, i) { return (i ? ',' : '') + '<span class="' + (k.ok ? 'xanh' : 'do') + '">' + e(k.c) + '</span>'; }).join('') : '<span class="do">—</span>';
        h.push('<tr><td class="giua">' + e(q.cau) + '</td><td>' + chuDeO(q) + '</td><td class="nho nd">' + e(q.noiDung) + '</td>' +
          '<td class="giua">' + o + '</td><td class="giua xanh">' + e(q.dung) + '</td></tr>');
      });
      h.push('<tr><td colspan="3" class="giua"><b>Tổng điểm</b></td><td class="giua do">' + e(dm.p2) + '</td><td></td></tr></table>');
    }
    if (!dsPhan && c.phan3.length) {
      muc++;
      h.push('<p><b>' + muc + '. PHẦN III: ' + e(d.tenPhan.III) + '</b></p>' + (d.moTaPhan.III ? '<p>' + e(d.moTaPhan.III) + '</p>' : ''));
      h.push('<table class="bang">' + tieuDeBang((c.coTraLoiIII ? '<th style="width:12%">Đáp án<br>của bạn</th>' : '') + '<th style="width:12%">Đáp số</th>'));
      c.phan3.forEach(function (q) {
        h.push('<tr><td class="giua">' + e(q.cau) + '</td><td>' + chuDeO(q) + '</td><td class="nho">' + e(q.noiDung) + '</td>' +
          (c.coTraLoiIII ? '<td class="giua ' + (q.ok ? 'xanh' : 'do') + '">' + e(q.hs || '—') + '</td>' : '') + '<td class="giua xanh">' + e(q.dung) + '</td></tr>');
      });
      h.push('<tr><td colspan="' + (c.coTraLoiIII ? 4 : 3) + '" class="giua"><b>Tổng điểm của bạn</b></td><td class="giua do">' + e(dm.p3) + '/' + e(dm.max3) + '</td></tr></table>');
    }

    if (nx.uu || nx.nhuoc) {
      h.push('<p class="nx">- Ưu và nhược điểm qua bài thi:</p>');
      if (nx.uu) h.push('<p style="margin-left:24px"><i>+ Ưu điểm: ' + e(nx.uu) + '</i></p>');
      if (nx.nhuoc) h.push('<p style="margin-left:24px"><i>+ Nhược điểm: ' + e(nx.nhuoc) + '</i></p>');
    }
    if (nx.khacPhuc) h.push('<p><span class="nx">- Hướng khắc phục:</span> <i>' + e(nx.khacPhuc) + '</i></p>');
    h.push('<p><b>Lời khuyên:</b> ' + (nx.loiKhuyen ? e(nx.loiKhuyen)
      : 'Dựa vào phân tích trên, trong thời gian tới, em hãy cố gắng khắc phục những hạn chế và phát huy những ưu điểm. Chúc <span class="do">' + e(d.hoTen) + '</span> đạt được kết quả cao trong kỳ thi tiếp theo!') + '</p>');
    h.push('<div class="chan-trang">Mã phiếu: ' + e(d.maPhieu) + ' · Ngày tạo: ' + e(d.ngay) + '</div>');
    h.push('</div></body></html>');
    return h.join('');
  }

  goc.renderPhieu = renderPhieu;
})(typeof window !== 'undefined' ? window : globalThis);
