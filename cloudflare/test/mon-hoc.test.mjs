/**
 * Kiểm thử API v2: môn học của lớp + cấu trúc đề khi gửi kết quả (chạy với máy chủ local, như api.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';

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

/** Điền mẫu kết quả theo cấu trúc: mọi em làm mã đề 101, em thứ i sai câu i+1. */
function dien(mau, dapAn) {
  const td = mau.KetQua[0], da101 = dapAn.DapAn.find((r) => r[0] === '101');
  return { KetQua: [td, ...mau.KetQua.slice(1).map((r, i) => {
    const x = r.slice(); x[5] = '101';
    td.forEach((h, j) => { const m = /^Câu (\d+)$/.exec(h); if (m) x[j] = +m[1] === i + 1 ? (da101[+m[1]] === 'A' ? 'B' : 'A') : da101[+m[1]]; });
    return x;
  })] };
}

const A = trinhDuyet();

test('môn học của lớp: tạo lớp có môn, đổi môn, danh sách cấu trúc đề', async () => {
  const r = await A.goi('/api/dang-ky', { hoTen: 'Cô Thu', tenKhongGian: 'Trung tâm thử v2', email: `thu.${lam}@vd.vn`, matKhau: 'matkhau123' });
  assert.equal(r.ok, true, r.loi);
  let dl = await A.rpc('gvTaoNhom', 'Lý 11A', 'vật lí');
  assert.equal(dl.monLop['Lý 11A'], 'Vật lí', 'môn chuẩn hóa theo danh sách có sẵn');
  assert.ok(dl.cauTrucDe.some((c) => c.id === 'thpt2025-vat-li' && /18 câu/.test(c.moTa)));
  assert.ok(dl.dsMon.includes('Tiếng Anh'));
  dl = await A.rpc('gvTaoNhom', 'Anh 10', '');
  assert.equal(dl.monLop['Anh 10'], '');
  dl = await A.rpc('gvDatMonLop', 'Anh 10', 'Tiếng Anh');
  assert.equal(dl.monLop['Anh 10'], 'Tiếng Anh');
  await A.rpc('gvThemNhieuHocSinh', [['Phạm An'], ['Lê Bình'], ['Vũ Chi']], {}, 'Lý 11A');
});

test('gửi kết quả Vật lí: tự gợi ý cấu trúc theo môn của lớp, chia 18/4/6, lưu cấu trúc vào lần thi', async () => {
  const mau = await A.rpc('gvLayMau', 'Lý 11A');
  assert.equal(mau.cauTruc, 'thpt2025-vat-li', 'mẫu theo môn của lớp');
  assert.ok(mau.ketQua.KetQua[0].includes('Câu 28') && !mau.ketQua.KetQua[0].includes('Câu 29'));
  const so = { kq: dien(mau.ketQua, mau.dapAn), da: mau.dapAn };
  const xt = await A.rpc('gvXemTruoc', so, {});
  assert.equal(xt.cauTruc, 'thpt2025-vat-li');
  assert.deepEqual(xt.phanDe.map((p) => p.soCau), [18, 4, 6]);
  assert.equal(xt.hocSinh[0].maxTong, '10');
  // em 1 sai câu 1 (phần I, 0,25đ) -> 9,75
  assert.equal(xt.hocSinh[0].tongDiem, '9.75');
  const bd = await A.rpc('gvBatDauDot', so, { baiThi: 'KT 15 phút', cauTruc: xt.cauTruc });
  const d = bd.dsDot[0];
  const tp = await A.rpc('gvTaoPhieuLo', d.maDot, so, d.canTao);
  assert.equal(tp.xong, 3);
  const dl = await A.rpc('gvTaiDuLieu');
  assert.equal(dl.dot.find((x) => x.maDot === d.maDot).cauTruc, 'thpt2025-vat-li');
  const ph = await A.rpc('gvDsPhieuLan', d.maDot);
  const p = (await A.rpc('gvXemPhieu', (ph.ds || ph.phieu || ph)[0].maPhieu)).d;
  assert.equal(p.cham.cauTruc.id, 'thpt2025-vat-li');
  assert.deepEqual(p.cham.phan.map((x) => [x.ma, x.cau.length]), [['I', 18], ['II', 4], ['III', 6]]);
  assert.equal(p.tenPhan.III, 'Câu trắc nghiệm trả lời ngắn.');
});

test('chọn tay cấu trúc khác gợi ý; lớp mới trong file nhận môn của đề', async () => {
  const ct = L.layCauTrucCoSan('thpt2025-tieng-anh');
  const mauKq = L.taoMauKetQua([{ maHs: '', hoTen: 'Ngô Dũng', lopMau: 'Anh 11 mới' }, { maHs: '', hoTen: 'Đỗ Em', lopMau: 'Anh 11 mới' }], '', null, ct);
  const mauDa = L.taoMauDapAn(ct);
  const so = { kq: dien(mauKq, mauDa), da: mauDa };
  const tuDong = await A.rpc('gvXemTruoc', so, {});
  assert.equal(tuDong.cauTruc, 'thpt2025-toan', 'lớp chưa có -> mặc định Toán');
  const xt = await A.rpc('gvXemTruoc', so, { cauTruc: 'thpt2025-tieng-anh' });
  assert.deepEqual(xt.phanDe.map((p) => [p.ma, p.soCau]), [['I', 40]]);
  assert.equal(xt.hocSinh[0].tongDiem, '9.75');
  const bd = await A.rpc('gvBatDauDot', so, { baiThi: 'Unit 1 test', cauTruc: 'thpt2025-tieng-anh' });
  await A.rpc('gvTaoPhieuLo', bd.dsDot[0].maDot, so, bd.dsDot[0].canTao);
  const dl = await A.rpc('gvTaiDuLieu');
  assert.equal(dl.monLop['Anh 11 mới'], 'Tiếng Anh');
  await assert.rejects(A.rpc('gvXemTruoc', so, { cauTruc: 'khong-co' }), /Không tìm thấy cấu trúc/);
});

test('cấu trúc đề tự tạo: nhân bản, chấm theo cấu trúc mới, không sửa được cấu trúc có sẵn, không xóa khi đang dùng', async () => {
  const phan = [{ ten: 'Trắc nghiệm', dang: 'trac_nghiem', soCau: 8, diemMoiCau: '0,5' }, { ten: 'Đúng sai', dang: 'dung_sai', soCau: 2, bangDiem: [0, 0.1, 0.25, 0.5, 3] }];
  await assert.rejects(A.rpc('gvLuuCauTruc', { id: 'thpt2025-toan', ten: 'X', mon: 'Toán', phan }), /không sửa được/);
  await assert.rejects(A.rpc('gvLuuCauTruc', { ten: 'Lỗi', mon: 'Toán', phan: [{ dang: 'trac_nghiem', soCau: 0, diemMoiCau: 1 }] }), /số câu/);
  let dl = await A.rpc('gvLuuCauTruc', { ten: 'Lý – kiểm tra 15 phút', mon: 'Vật lí', phan });
  const ct = dl.cauTrucDe.find((c) => c.ten === 'Lý – kiểm tra 15 phút');
  assert.ok(ct && !ct.coSan && /tổng 10 điểm/.test(ct.moTa), JSON.stringify(ct));
  await assert.rejects(A.rpc('gvLuuCauTruc', { ten: 'lý – KIỂM TRA 15 phút', mon: 'Vật lí', phan }), /Đã có cấu trúc/);
  const mau = await A.rpc('gvLayMau', 'Lý 11A', ct.id);
  assert.ok(mau.ketQua.KetQua[0].includes('Câu 10') && !mau.ketQua.KetQua[0].includes('Câu 11'));
  const so = { kq: dien(mau.ketQua, mau.dapAn), da: mau.dapAn };
  const xt = await A.rpc('gvXemTruoc', so, { cauTruc: ct.id });
  assert.deepEqual(xt.phanDe.map((p) => p.soCau), [8, 2]);
  assert.equal(xt.hocSinh[0].tongDiem, '9.50', 'sai câu 1 (0,5đ)');
  const bd = await A.rpc('gvBatDauDot', so, { baiThi: 'KT 15 phút lý', cauTruc: ct.id });
  await A.rpc('gvTaoPhieuLo', bd.dsDot[0].maDot, so, bd.dsDot[0].canTao);
  await assert.rejects(A.rpc('gvXoaCauTruc', ct.id), /đang dùng cho 1 lần thi/);
  dl = await A.rpc('gvLuuCauTruc', { id: ct.id, ten: 'Lý – 15 phút', mon: 'Vật lí', phan });
  assert.ok(dl.cauTrucDe.some((c) => c.id === ct.id && c.ten === 'Lý – 15 phút' && c.soLanDung === 1));
  dl = await A.rpc('gvLuuCauTruc', { ten: 'Tạm', mon: 'Toán', phan });
  const tam = dl.cauTrucDe.find((c) => c.ten === 'Tạm');
  dl = await A.rpc('gvXoaCauTruc', tam.id);
  assert.ok(!dl.cauTrucDe.some((c) => c.id === tam.id));
});
