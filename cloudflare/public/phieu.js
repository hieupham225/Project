/**
 * Dựng phiếu kết quả (HTML đầy đủ) từ dữ liệu đã chấm. Dùng chung cho trang phụ huynh và trang giáo viên.
 * renderPhieu(d, logo) -> chuỗi HTML (đặt vào iframe srcdoc).  Bố cục theo mẫu "Phân tích bài thi".
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

  function renderPhieu(d, logo) {
    if (d.htmlMau) return renderMauWord(d);
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
    h.push('<tr><td colspan="3"><b>' + (so++) + '. Kết quả cụ thể:</b> ');
    // phiếu mặc định: ghi theo loại câu (mục 3 = Tự luận) thay cho "Phần 1/2/3"
    if (c.phan1.length) h.push('Trắc nghiệm: <span class="do">' + e(dm.p1) + '</span>/' + e(dm.max1) + '; ');
    if (c.phan2.length) h.push('Đúng sai: <span class="do">' + e(dm.p2) + '</span>/' + e(dm.max2) + '; ');
    if (c.phan3.length) h.push('Tự luận: <span class="do">' + e(dm.p3) + '</span>/' + e(dm.max3) + '; ');
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
    if (c.phan1.length) {
      muc++;
      h.push('<p><b>' + muc + '. PHẦN I: ' + e(d.tenPhan.I) + '</b></p>' + (d.moTaPhan.I ? '<p>' + e(d.moTaPhan.I) + '</p>' : ''));
      h.push('<table class="bang">' + tieuDeBang('<th style="width:10%">Đáp án<br>của bạn</th><th style="width:10%">Đáp án<br>đúng</th>'));
      c.phan1.forEach(function (q) {
        h.push('<tr><td class="giua">' + e(q.cau) + '</td><td>' + chuDeO(q) + '</td><td class="nho">' + e(q.noiDung) + '</td>' +
          '<td class="giua ' + (q.ok ? 'xanh' : 'do') + '">' + e(q.hs || '—') + '</td><td class="giua xanh">' + e(q.dung) + '</td></tr>');
      });
      h.push('<tr><td colspan="3" class="giua"><b>Tổng điểm</b></td><td class="giua do">' + e(dm.p1) + '</td><td></td></tr></table>');
    }
    if (c.phan2.length) {
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
    if (c.phan3.length) {
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
