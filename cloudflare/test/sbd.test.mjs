/**
 * Kiểm thử v1.1: số báo danh 8 số (cố định cả khóa) — nhập lớp, ghép kết quả thi theo SBD, tự học SBD, mẫu phiếu nhập lớp.
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
const A = trinhDuyet();
const hs = (dl, ten) => dl.hocSinh.find((h) => h.hoTen === ten);

test('nhập lớp có số báo danh: lưu SBD, kiểm tra 8 số / trùng, bổ sung cho em đã có', async () => {
  assert.equal((await A.goi('/api/dang-ky', { hoTen: 'Thầy Nam', tenKhongGian: 'TT thử SBD', email: `nam.${lam}@vd.vn`, matKhau: 'matkhau123' })).ok, true);
  await A.rpc('gvTaoNhom', 'Toán 12A', 'Toán');
  await A.rpc('gvThemNhieuHocSinh', [['Họ và tên', 'Lớp'], ['Trần Bình', 'Toán 12A']], {}, '');
  const td = ['STT', 'Số báo danh', 'Họ và tên', 'Ngày sinh', 'Lớp', 'SĐT phụ huynh'];
  await assert.rejects(A.rpc('gvThemNhieuHocSinh', [td, ['1', '1234567', 'Lê Chi', '', 'Toán 12A', '']], {}, ''), /đúng 8 chữ số/);
  await assert.rejects(A.rpc('gvThemNhieuHocSinh', [td, ['1', '24010001', 'Lê Chi', '', 'Toán 12A', ''], ['2', '24010001', 'Võ Dung', '', 'Toán 12A', '']], {}, ''), /bị trùng/);
  const dl = await A.rpc('gvThemNhieuHocSinh', [td,
    ['1', '24010001', 'Nguyễn An', '12/05/2008', 'Toán 12A', '0912000001'],
    ['2', '24010002', 'Trần Bình', '03/09/2008', 'Toán 12A', ''], // đã có (cùng tên trong lớp) -> bổ sung SBD + ngày sinh
    ['3', '24010003', 'Lê Chi', '', 'Toán 12A', '']], {}, '');
  assert.match(dl.thongBao, /Đã thêm 2 học sinh mới/);
  assert.match(dl.thongBao, /bổ sung SBD/);
  assert.equal(hs(dl, 'Nguyễn An').sbd, '24010001');
  assert.equal(hs(dl, 'Trần Bình').sbd, '24010002');
  assert.equal(hs(dl, 'Trần Bình').ngaySinh, '03/09/2008');
  assert.equal(dl.hocSinh.filter((h) => h.hoTen === 'Trần Bình').length, 1, 'không tạo trùng');
  // SBD đã có, tên viết khác -> vẫn là em đó (không tạo mới)
  const dl2 = await A.rpc('gvThemNhieuHocSinh', [td, ['1', '24010003', 'Lê Thị Chi', '', 'Toán 12A', '0912000003']], {}, '');
  assert.equal(dl2.hocSinh.length, 3);
  assert.equal(hs(dl2, 'Lê Chi').sdt, '0912000003');
  // sửa 1 học sinh: SBD trùng / sai định dạng
  await assert.rejects(A.rpc('gvLuuHocSinh', { maHs: hs(dl2, 'Lê Chi').maHs, hoTen: 'Lê Chi', lop: 'Toán 12A', sbd: '24010001' }), /đã là của học sinh Nguyễn An/);
  await assert.rejects(A.rpc('gvLuuHocSinh', { hoTen: 'Mới', lop: 'Toán 12A', sbd: '12ab' }), /8 chữ số/);
});

test('mẫu phiếu nhập lớp điền sẵn học sinh của lớp', async () => {
  const r = await A.rpc('gvMauNhapLop', 'Toán 12A');
  assert.deepEqual(r.so.DanhSach[0], ['STT', 'Số báo danh', 'Họ và tên', 'Ngày sinh', 'Lớp', 'SĐT phụ huynh', 'Ghi chú']);
  assert.equal(r.so.DanhSach.length, 4);
  assert.ok(r.so.DanhSach.some((d) => d[1] === '24010001' && d[2] === 'Nguyễn An' && d[3] === '12/05/2008'));
  const trong = await A.rpc('gvMauNhapLop', '');
  assert.equal(trong.so.DanhSach.length, 2, 'không chọn lớp: 1 dòng ví dụ');
});

test('gửi kết quả: ghép theo SBD (tên trong file gõ khác), SBD lạ -> học sinh mới mang SBD đó', async () => {
  const mau = await A.rpc('gvLayMau', 'Toán 12A');
  const td = mau.ketQua.KetQua[0];
  assert.ok(mau.ketQua.KetQua.slice(1).some((r) => r[td.indexOf('Số báo danh')] === '24010001'), 'mẫu kết quả điền sẵn SBD');
  const da = L.taoMauDapAn().DapAn.find((r) => r[0] === '105');
  const dong = (sbd, ten) => { const r = td.map(() => ''); r[td.indexOf('Họ và tên')] = ten; r[td.indexOf('Lớp')] = 'Toán 12A'; r[td.indexOf('Số báo danh')] = sbd; r[td.indexOf('Mã đề thi')] = '105';
    for (let n = 1; n <= 12; n++) r[td.indexOf('Câu ' + n)] = da[n]; return r; };
  const so = { kq: { KetQua: [td, dong('24010001', 'Nguyen Van An'), dong('24010002', 'Trần Bình'), dong('24019999', 'Phạm Dũng'), dong('24010003', 'Hoàng Tuấn')] }, da: L.taoMauDapAn() };
  const xt = await A.rpc('gvXemTruoc', so, {});
  const tt = (i) => xt.hocSinh[i];
  if (process.env.GO_LOI) console.log(JSON.stringify(xt.hocSinh.map((h) => [h.hoTen, h.trangThai, h.canChon, h.lyDo, h.nhom, h.loi])));
  assert.equal(tt(0).trangThai, 'co'); assert.equal(tt(0).hs.sbd, '24010001', 'SBD khớp dù tên viết không dấu');
  assert.equal(tt(1).trangThai, 'co');
  assert.equal(tt(2).trangThai, 'moi');
  assert.equal(tt(3).canChon, 'lechSbd', 'SBD của em khác tên hẳn -> hỏi lại');
  const bd = await A.rpc('gvBatDauDot', so, { baiThi: 'KT', quyetDinh: { 3: 'boqua' } });
  await A.rpc('gvTaoPhieuLo', bd.dsDot[0].maDot, so, bd.dsDot[0].canTao);
  const dl = await A.rpc('gvTaiDuLieu');
  assert.equal(hs(dl, 'Phạm Dũng').sbd, '24019999', 'học sinh mới mang SBD trong file');
});

test('tự học SBD: em chưa có SBD, file kết quả có SBD -> lưu lại', async () => {
  await A.rpc('gvThemNhieuHocSinh', [['Họ và tên', 'Lớp'], ['Đỗ Giang', 'Toán 12A']], {}, '');
  const mau = await A.rpc('gvLayMau', 'Toán 12A');
  const td = mau.ketQua.KetQua[0];
  const r = td.map(() => ''); r[td.indexOf('Họ và tên')] = 'Đỗ Giang'; r[td.indexOf('Lớp')] = 'Toán 12A'; r[td.indexOf('Số báo danh')] = '24010077'; r[td.indexOf('Mã đề thi')] = '105';
  const so = { kq: { KetQua: [td, r] }, da: L.taoMauDapAn() };
  const bd = await A.rpc('gvBatDauDot', so, { baiThi: 'KT 2' });
  await A.rpc('gvTaoPhieuLo', bd.dsDot[0].maDot, so, bd.dsDot[0].canTao);
  assert.equal(hs(await A.rpc('gvTaiDuLieu'), 'Đỗ Giang').sbd, '24010077');
});

test('sửa điểm từng phần trên app: kiểm tra tối đa, tổng tự cộng, cập nhật phiếu lần sau', async () => {
  const mau = await A.rpc('gvLayMau', 'Toán 12A');
  const td = mau.ketQua.KetQua[0];
  const da = L.taoMauDapAn().DapAn.find((r) => r[0] === '105');
  const r = td.map(() => ''); r[td.indexOf('Họ và tên')] = 'Nguyễn An'; r[td.indexOf('Lớp')] = 'Toán 12A'; r[td.indexOf('Số báo danh')] = '24010001'; r[td.indexOf('Mã đề thi')] = '105';
  for (let n = 1; n <= 16; n++) r[td.indexOf('Câu ' + n)] = n <= 12 ? da[n] : da[n].split('').join(',');
  const so = { kq: { KetQua: [td, r] }, da: L.taoMauDapAn() };
  const tao = async () => { const bd = await A.rpc('gvBatDauDot', so, { baiThi: 'Khảo sát' }); await A.rpc('gvTaoPhieuLo', bd.dsDot[0].maDot, so, bd.dsDot[0].canTao); return bd.dsDot[0].maDot; };
  const lan1 = await tao(), lan2 = await tao();
  const ph1 = (await A.rpc('gvDsPhieuLan', lan1))[0];
  const cp = await A.rpc('gvCacPhanDiem', ph1.maPhieu);
  assert.deepEqual(cp.phan.map((x) => [x.ten, x.diem, x.toiDa]), [['Phần I', '3.00', '3'], ['Phần II', '4.00', '4'], ['Phần III', '0.00', '3']]);
  await assert.rejects(A.rpc('gvSuaDiem', ph1.maPhieu, ['3', '4', '3,5']), /tối đa 3/);
  await assert.rejects(A.rpc('gvSuaDiem', ph1.maPhieu, ['3', '4']), /không khớp/);
  const kq = await A.rpc('gvSuaDiem', ph1.maPhieu, ['2,75', '4', '1.5']);
  assert.equal(kq.tongDiem, '8.25');
  const p1 = (await A.rpc('gvXemPhieu', ph1.maPhieu)).d;
  assert.deepEqual([p1.cham.diem.p1, p1.cham.diem.p3, p1.cham.diem.tong], ['2.75', '1.50', '8.25']);
  assert.deepEqual(p1.suaTay.diemGoc, ['3.00', '4.00', '0.00']);
  const ds1 = await A.rpc('gvDsPhieuLan', lan1);
  assert.equal(ds1[0].tongDiem, '8.25'); assert.ok(ds1[0].suaTay);
  const p2 = (await A.rpc('gvXemPhieu', (await A.rpc('gvDsPhieuLan', lan2))[0].maPhieu)).d;
  assert.equal(p2.lichSu.find((x) => x.lan === 1).tong, '8.25', 'bảng các lần làm trên phiếu lần 2');
  assert.equal(p2.chenhLech, '-1.25');
  const dl = await A.rpc('gvTaiDuLieu');
  assert.ok(dl.diem.some((x) => x[0] === lan1 && x[2] === '8.25'), 'tổng hợp / điểm TB dùng điểm mới');
});
