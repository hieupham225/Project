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
