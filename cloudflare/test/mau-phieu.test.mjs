/**
 * Kiểm thử v1.1: mẫu phiếu từ Word — đọc .docx trộn thư, lưu mẫu (lọc HTML), gửi kết quả với mẫu, điền phiếu, sửa điểm.
 * Dùng file Word trộn thư dựng sẵn trong bộ nhớ (không phụ thuộc file thật của người dùng).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as MW from '../src/mau-word.js';

const GOC = process.env.GOC || 'http://127.0.0.1:8787';
const lam = Date.now().toString(36);

function trinhDuyet() {
  let ck = '';
  const goi = async (duong, duLieu) => {
    const r = await fetch(GOC + duong, {
      method: duLieu === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KQ': '1', Cookie: ck },
      body: duLieu === undefined ? undefined : JSON.stringify(duLieu)
    });
    const sc = r.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    return { ma: r.status, ...(await r.json()) };
  };
  const rpc = async (ham, ...thamSo) => {
    const r = await goi('/api/rpc', { ham, thamSo });
    if (r.ma !== 200) throw new Error(r.loi);
    return r;
  };
  return { goi, rpc };
}
const A = trinhDuyet(), PH = trinhDuyet();

// --- document.xml trộn thư tối giản: trường đơn giản (fldSimple), trường nhiều run (fldChar), bảng gộp ô, {{…}} ---
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const truongPhuc = (ten, mau = 'FF0000') => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> MERGEFIELD ${ten} </w:instrText></w:r>` +
  `<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:b/><w:color w:val="${mau}"/></w:rPr><w:t>«${ten}»</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const docXml = `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>PHIẾU NHẬN XÉT &amp; KẾT QUẢ</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Họ và tên: </w:t></w:r>${truongPhuc('Họ_và_tên')}<w:r><w:t xml:space="preserve"> – SBD: </w:t></w:r><w:fldSimple w:instr=" MERGEFIELD Số_báo_danh "><w:r><w:t>«Số_báo_danh»</w:t></w:r></w:fldSimple></w:p>
<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>
<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>
<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:shd w:fill="F2F2F2"/></w:tcPr><w:p><w:r><w:t>Điểm</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Trắc nghiệm</w:t></w:r></w:p></w:tc><w:tc><w:p>${truongPhuc('F7')}</w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Tổng điểm</w:t></w:r></w:p></w:tc><w:tc><w:p>${truongPhuc('Tổng_điểm')}</w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:r><w:t>Nhận xét: {{Nhận </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>xét}}</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body></w:document>`;

test('đọc Word trộn thư: trường (đơn giản / nhiều run / {{…}}), kiểu chữ, bảng gộp ô; tên trường kiểu Word', () => {
  const kq = MW.docMauWord({ 'word/document.xml': docXml });
  assert.equal(kq.ok, true);
  assert.deepEqual(kq.truong, ['Họ_và_tên', 'Số_báo_danh', 'F7', 'Tổng_điểm', 'Nhận xét']);
  assert.match(kq.html, /PHIẾU NHẬN XÉT &amp; KẾT QUẢ/);
  assert.match(kq.html, /colspan="2"/);
  assert.match(kq.html, /data-truong="Họ_và_tên" style="[^"]*font-weight:bold[^"]*color:#FF0000/);
  assert.ok(!/«Họ_và_tên»<\/span><span/.test(kq.html.replace(/data-truong[^>]*>«Họ_và_tên»/, '')), 'kết quả trộn cũ không bị lặp');
  assert.equal(Math.round(kq.trang.rong), 595);
  const ra = MW.dienMau(kq.html, { Họ_và_tên: 'Lê <An>', F7: '3.00', 'nhận_xét': 'Dòng 1\nDòng 2' });
  assert.match(ra, /Lê &lt;An&gt;/); assert.match(ra, /Dòng 1<br>Dòng 2/); assert.ok(!/«Họ_và_tên»/.test(ra));
  assert.equal(MW.tenTruongWord('Ưu, nhược', 37), 'Ưu_nhược');
  assert.equal(MW.tenTruongWord('', 7), 'F8');
  assert.equal(MW.tenTruongWord('12', 3), 'M_12');
  assert.equal(MW.tenTruongWord('Họ và tên', 2), 'Họ_và_tên');
});

test('lưu mẫu (lọc mã độc), gửi kết quả với mẫu, phụ huynh xem phiếu đã điền, sửa điểm cập nhật trường điểm', async () => {
  assert.equal((await A.goi('/api/dang-ky', { hoTen: 'Thầy Mẫu', tenKhongGian: 'TT thử mẫu', email: `mau.${lam}@vd.vn`, matKhau: 'matkhau123' })).ok, true);
  const kq = MW.docMauWord({ 'word/document.xml': docXml });
  const doc = kq.html.replace('PHIẾU', '<script>alert(1)</script><img src="x" onerror="alert(2)">PHIẾU').replace('<p ', '<p onclick="alert(3)" ');
  let dl = await A.rpc('gvLuuMauPhieu', { ten: 'Phiếu nhận xét', html: doc, truong: kq.truong, trang: kq.trang, tenTep: 'nx.docx' });
  const m = dl.mauPhieu.find((x) => x.ten === 'Phiếu nhận xét');
  assert.equal(m.soTruong, 5);
  const luu = await A.rpc('gvLayMauPhieu', m.id);
  assert.ok(!/script|onerror|onclick|src="x"/.test(luu.html), 'đã lọc mã độc');
  assert.match(luu.html, /data-truong="F7"/);

  await A.rpc('gvTaoNhom', 'Văn 10', '');
  // file kết quả kiểu trộn thư: cột điểm + cột định dạng không tiêu đề (F8), Tổng điểm, Nhận xét
  const td = ['STT', 'Họ và tên', 'Lớp', 'Số báo danh', 'Mã đề thi', 'Điểm trắc nghiệm', '', 'Tổng điểm', 'Nhận xét'];
  const so = { kq: { KetQua: [td, ['1', 'Ngô Bảo', 'Văn 10', '24019001', '', '3', '3.00', '7.5', 'Viết tốt\nCần đọc thêm'], ['2', 'Đặng Chi', 'Văn 10', '24019002', '', '2', '2.00', '6', '']] }, da: null };
  const xt = await A.rpc('gvXemTruoc', so, { mauPhieu: m.id });
  assert.deepEqual(xt.mauPhieu.truongThieu, [], 'mọi trường có cột hoặc là trường hệ thống');
  assert.match(xt.phieuXemTruoc.htmlMau, /Ngô Bảo/);
  const bd = await A.rpc('gvBatDauDot', so, { baiThi: 'Nhận xét tháng 10', mauPhieu: m.id });
  const d = bd.dsDot[0];
  await A.rpc('gvTaoPhieuLo', d.maDot, so, d.canTao);
  await assert.rejects(A.rpc('gvXoaMauPhieu', m.id), /đang dùng cho 1 lần thi/);
  const ds = await A.rpc('gvDsPhieuLan', d.maDot);
  const pb = Object.values(ds).find((x) => x && x.hoTen === 'Ngô Bảo');
  const xp = (await A.rpc('gvXemPhieu', pb.maPhieu)).d;
  assert.match(xp.htmlMau, /24019001/); assert.match(xp.htmlMau, /Viết tốt<br>Cần đọc thêm/); assert.match(xp.htmlMau, />3\.00</);
  // sửa điểm: phần I 3 -> 2.5 => trường F7 (cột định dạng của "Điểm trắc nghiệm") đổi theo
  const cp = await A.rpc('gvCacPhanDiem', pb.maPhieu);
  await A.rpc('gvSuaDiem', pb.maPhieu, cp.phan.map((x, i) => (i === 0 ? '2.5' : x.diem)));
  const xp2 = (await A.rpc('gvXemPhieu', pb.maPhieu)).d;
  assert.match(xp2.htmlMau, />2\.50</);
  // phụ huynh
  await A.rpc('gvCongBo', d.maDot, true);
  const dlHs = await A.rpc('gvTaiDuLieu');
  const ma = dlHs.hocSinh.find((h) => h.hoTen === 'Ngô Bảo').maTraCuu;
  const tc = await PH.goi('/api/tra-cuu', { ma });
  const ph = await PH.goi('/api/phieu', { ma, maPhieu: tc.phieu[0].maPhieu });
  assert.match(ph.d.htmlMau, /Ngô Bảo/); assert.ok(ph.d.trangMau.rong > 500);
});

test('Word thường: tự dò trường theo file Excel (bảng đáp án, giá trị, nhiều dòng) và theo nhãn', () => {
  const run = (chu, mau) => `<w:r>${mau ? `<w:rPr><w:b/><w:color w:val="${mau}"/></w:rPr>` : ''}<w:t xml:space="preserve">${chu}</w:t></w:r>`;
  const p = (...r) => `<w:p>${r.join('')}</w:p>`;
  const o = (chu) => `<w:tc><w:p>${run(chu)}</w:p></w:tc>`;
  const hang = (...c) => `<w:tr>${c.map(o).join('')}</w:tr>`;
  const doc = `<?xml version="1.0"?><w:document ${W}><w:body>
${p(run('Họ và tên: '), run('Trần Minh An', 'FF0000'), run('   Mã đề: '), run('102', 'FF0000'))}
${p(run('Điểm phần 1: '), run('2.50', 'FF0000'), run('/3'))}
<w:tbl><w:tblGrid><w:gridCol w:w="800"/><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/></w:tblGrid>
${hang('Câu', 'Đáp án của bạn', 'Đáp án đúng')}${hang('1', 'A', 'A')}${hang('2', 'C', 'B')}${hang('3', 'D', 'D')}${hang('4', 'B', 'C')}
</w:tbl>
${p(run('+ Ưu điểm: Chăm chỉ'))}${p(run('+ Nhược điểm: Còn ẩu'))}
<w:sectPr/></w:body></w:document>`;
  const tieuDe = ['STT', 'Họ và tên', 'Mã đề thi', 'Điểm phần 1', '', 'Câu 1', 'Câu 2', 'Câu 3', 'Câu 4', 'Nhận xét', '1', '2', '3', '4'];
  const dong = [
    ['1', 'Lê Hà', '101', '3', '3.00', 'A', 'B', 'C', 'D', 'Tốt', 'A', 'B', 'C', 'D'],
    ['2', 'Trần Minh An', '102', '2.5', '2.50', 'A', 'C', 'D', 'B', '+ Ưu điểm: Chăm chỉ\r\n+ Nhược điểm: Còn ẩu', 'A', 'B', 'D', 'C']
  ];
  const kq = MW.docMauWord({ 'word/document.xml': doc }, { duLieu: { tieuDe, dong } });
  const theo = Object.fromEntries(kq.doDuoc.map((x) => [x.goc + '|' + x.cach, x.truong]));
  assert.equal(theo['Trần Minh An|giá trị'], 'Họ_và_tên');
  assert.equal(theo['102|giá trị'], 'Mã_đề_thi', 'số ngắn: nhờ nhãn "Mã đề"');
  assert.equal(theo['2.50|giá trị'], 'F5', 'chọn cột định dạng "2.50" chứ không phải cột gốc "2.5"');
  assert.deepEqual(kq.doDuoc.filter((x) => x.cach === 'bảng').map((x) => x.truong + '=' + x.goc), ['Câu_1=A', 'Câu_2=C', 'Câu_3=D', 'Câu_4=B', 'M_1=A', 'M_2=B', 'M_3=D', 'M_4=C']);
  assert.equal(kq.doDuoc.find((x) => x.cach === 'nhiều dòng').truong, 'Nhận_xét');
  const ra = MW.dienMau(kq.html, Object.fromEntries(tieuDe.map((h, j) => [MW.tenTruongWord(h, j), dong[0][j]])));
  assert.match(ra, /Lê Hà/); assert.ok(!/Trần Minh An|Còn ẩu/.test(ra), 'giá trị mẫu đã được thay hết');
  // không có Excel: theo nhãn
  const k2 = MW.docMauWord({ 'word/document.xml': doc });
  assert.deepEqual(k2.doDuoc.map((x) => [x.truong, x.goc]), [['Họ_và_tên', 'Trần Minh An'], ['Mã_đề_thi', '102']]);
});

test('khối có sẵn: bảng phân tích tự dựng theo đề (số câu, chủ đề đúng mã đề), điểm các phần, nhận xét', async () => {
  const L = await import('../src/logic.js');
  const B = trinhDuyet();
  assert.equal((await B.goi('/api/dang-ky', { hoTen: 'Cô Khối', tenKhongGian: 'TT khối', email: `khoi.${lam}@vd.vn`, matKhau: 'matkhau123' })).ok, true);
  const html = '<div class="mau-word" style="width:500pt"><p style="margin:0">Họ tên: <span class="truong" data-truong="Họ_và_tên" style="">«Họ_và_tên»</span> – Xếp hạng: <span class="khoi" data-khoi="xep-hang">Xếp hạng</span></p>' +
    '<div class="khoi" data-khoi="bang-diem">Điểm các phần</div><div class="khoi" data-khoi="phan-tich">Bảng phân tích từng câu</div><div class="khoi" data-khoi="nhan-xet">Nhận xét</div></div>';
  const dl = await B.rpc('gvLuuMauPhieu', { ten: 'Mẫu khối', html, truong: ['Họ_và_tên'], trang: { rong: 595, trai: 36, phai: 36 } });
  const mau = dl.mauPhieu[0].id;
  assert.ok(dl.khoiPhieu.some((k) => k.ma === 'phan-tich'));
  assert.match((await B.rpc('gvLayMauPhieu', mau)).html, /data-khoi="phan-tich"/, 'bộ lọc giữ khối');
  // Toán: mã 105 (đề gốc) và 106 (đảo câu phần I) — tab CauHoi dạng ngang
  const ct = L.layCauTrucCoSan('thpt2025-toan'), da = L.taoMauDapAn(null, { daoCau: true });
  const td = ['STT', 'Họ và tên', 'Lớp', 'Thứ hạng', 'Mã đề thi', ...Array.from({ length: 22 }, (_, i) => 'Câu ' + (i + 1)), 'Ưu điểm'];
  const so = { kq: { KetQua: [td, ['1', 'Hồ An', 'Toán K', '2', '105', ...da.DapAn[1].slice(1), 'Chăm'], ['2', 'Vũ Bình', 'Toán K', '1', '106', ...da.DapAn[2].slice(1), '']] }, da };
  const bd = await B.rpc('gvBatDauDot', so, { baiThi: 'KT khối', mauPhieu: mau, cauTruc: ct.id });
  await B.rpc('gvTaoPhieuLo', bd.dsDot[0].maDot, so, bd.dsDot[0].canTao);
  const ds = Object.values(await B.rpc('gvDsPhieuLan', bd.dsDot[0].maDot)).filter((x) => x && x.maPhieu);
  const xem = async (ten) => (await B.rpc('gvXemPhieu', ds.find((x) => x.hoTen === ten).maPhieu)).d.htmlMau;
  const goc = da.CauHoi.slice(1).map((r) => r[5]);
  const h5 = await xem('Hồ An'), h6 = await xem('Vũ Bình');
  assert.ok(!/class="khoi"/.test(h5), 'khối đã được dựng');
  assert.equal((h5.match(/<tr>/g) || []).length, 3 * 2 + 22, '3 bảng: 22 hàng câu + mỗi bảng 1 hàng tiêu đề + 1 hàng tổng');
  assert.ok(h5.indexOf(L.chuoi_(goc[0])) < h5.indexOf(L.chuoi_(goc[1])), 'mã 105: câu 1 = câu 1 đề gốc');
  const i6 = h6.indexOf('PHẦN I');
  assert.ok(h6.indexOf(goc[1], i6) < h6.indexOf(goc[0], i6), 'mã 106: câu 1 = câu 2 đề gốc');
  assert.match(h5, /Trắc nghiệm: <span[^>]*>3\.00<\/span>\/3/); assert.match(h5, /Tổng điểm: <span[^>]*>[\d.]+<\/span>\/10/);
  assert.match(h5, />2<\/span> \/ 2/, 'xếp hạng 2 / 2');
  assert.match(h5, /Ưu điểm: Chăm/); assert.match(h6, /Chúc <span[^>]*>Vũ Bình/);
  // Vật lí 18/4/6: cùng mẫu, bảng tự đủ 28 câu
  const ctL = L.layCauTrucCoSan('thpt2025-vat-li'), daL = L.taoMauDapAn(ctL), kqL = L.taoMauKetQua([{ maHs: '', hoTen: 'Lý Cường', lopMau: 'Lý K' }], '', null, ctL);
  kqL.KetQua[1][5] = '101'; kqL.KetQua[0].forEach((h, j) => { const m = /^Câu (\d+)$/.exec(h); if (m) kqL.KetQua[1][j] = daL.DapAn[1][+m[1]]; });
  kqL.KetQua[1][kqL.KetQua[0].indexOf('Điểm tự luận')] = '1.5'; // phần III tự luận: giáo viên nhập điểm
  const soL = { kq: kqL, da: daL };
  const bdL = await B.rpc('gvBatDauDot', soL, { baiThi: 'Lý khối', mauPhieu: mau, cauTruc: ctL.id });
  await B.rpc('gvTaoPhieuLo', bdL.dsDot[0].maDot, soL, bdL.dsDot[0].canTao);
  const pL = Object.values(await B.rpc('gvDsPhieuLan', bdL.dsDot[0].maDot)).find((x) => x && x.maPhieu);
  const hL = (await B.rpc('gvXemPhieu', pL.maPhieu)).d.htmlMau;
  assert.equal((hL.match(/<tr>/g) || []).length, 3 * 2 + 28);
  assert.match(hL, /PHẦN III: Tự luận/);
  assert.match(hL, /Tổng điểm: <span[^>]*>10\.00<\/span>\/10/);
});

test('trường Logo: ảnh logo (data:image) chèn thành <img>, giá trị khác vẫn là chữ', async () => {
  const MW = await import('../src/mau-word.js');
  const html = '<span class="truong" data-truong="Logo">«Logo»</span>';
  assert.match(MW.dienMau(html, { Logo: 'data:image/png;base64,iVBORw0KGgo=' }), /<img src="data:image\/png;base64,iVBORw0KGgo=" alt=""/);
  assert.doesNotMatch(MW.dienMau(html, { Logo: '"><script>x</script>' }), /<script>/);
});
