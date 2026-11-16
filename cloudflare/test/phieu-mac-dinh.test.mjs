/** Mẫu mặc định "Kết quả kiểm tra" (public/phieu.js) vẽ theo đúng các phần của cấu trúc đề (không cần máy chủ). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as KP from '../src/khoi-phieu.js';

const g = { KhoiPhieu: KP }; g.globalThis = g;
vm.runInNewContext(fs.readFileSync(new URL('../public/phieu.js', import.meta.url), 'utf8').replace("typeof window !== 'undefined' ? window : globalThis", 'globalThis'), g);
const ve = (phan, them = {}) => g.renderPhieu(Object.assign({ hoTen: 'An', lop: 'A', tieuDe: 'T', maPhieu: 'P', ngay: '1/1/2026', tenPhan: {}, moTaPhan: {}, nhanXet: {},
  cham: { phan, diem: { tong: '10.00', maxTong: '10' }, phan1: [], phan2: [], phan3: [] } }, them), '');
const cau = (n, hs, dung) => ({ cau: n, chuDe: 'CĐ' + n, noiDung: 'ND' + n, hs, dung, ok: hs === dung });
const ds = (n) => ({ cau: n, chuDe: 'CĐ', noiDung: 'ND', hs: 'Đ,S,Đ,S', dung: 'DSDS', kyTu: [{ c: 'Đ', ok: true }, { c: 'S', ok: true }, { c: 'Đ', ok: true }, { c: 'S', ok: true }] });

test('4 phần (TN, ĐS, Trả lời ngắn, Tự luận): đủ 4 bảng, đúng tên và điểm từng phần', () => {
  const h = ve([
    { ma: 'I', ten: 'Trắc nghiệm', dang: 'trac_nghiem', diem: '4.00', toiDa: '4', cau: [cau(1, 'A', 'A')] },
    { ma: 'II', ten: 'Đúng sai', dang: 'dung_sai', diem: '4.00', toiDa: '4', cau: [ds(1)] },
    { ma: 'III', ten: 'Trả lời ngắn', dang: 'tra_loi_ngan', diem: '0.50', toiDa: '1', cau: [cau(1, '12', '12'), cau(2, '3', '5')] },
    { ma: 'IV', ten: 'Tự luận', dang: 'tu_luan', diem: '0.75', toiDa: '1', cau: [cau(1, '', '7')] }]);
  for (const x of ['1. PHẦN I: Trắc nghiệm', '2. PHẦN II: Đúng sai', '3. PHẦN III: Trả lời ngắn', '4. PHẦN IV: Tự luận']) assert.ok(h.includes(x), x);
  assert.match(h, /Trắc nghiệm: <span class="do">4\.00<\/span>\/4; Đúng sai: <span class="do">4\.00<\/span>\/4; Trả lời ngắn: <span class="do">0\.50<\/span>\/1; Tự luận: <span class="do">0\.75<\/span>\/1;/);
  assert.ok(h.includes('<td class="giua do">3</td>'), 'trả lời ngắn có cột đáp án của học sinh (sai: đỏ)');
  assert.ok(h.includes('Tổng điểm của bạn</b></td><td class="giua do">0.75/1'), 'tự luận: tổng điểm x/tối đa');
});

test('đổi thứ tự (Đúng sai trước Trắc nghiệm): bảng theo dạng bài, không theo vị trí', () => {
  const h = ve([
    { ma: 'I', ten: 'Đúng sai', dang: 'dung_sai', diem: '4.00', toiDa: '4', cau: [ds(1)] },
    { ma: 'II', ten: 'Trắc nghiệm', dang: 'trac_nghiem', diem: '1.00', toiDa: '1', cau: [cau(1, 'B', 'A')] }]);
  const i = h.indexOf('PHẦN I: Đúng sai'), j = h.indexOf('PHẦN II: Trắc nghiệm');
  assert.ok(i > 0 && j > i);
  assert.ok(h.slice(i, j).includes('<span class="xanh">Đ</span>'), 'phần I vẽ bảng đúng/sai');
  assert.ok(h.slice(j).includes('<td class="giua do">B</td>'), 'phần II vẽ bảng trắc nghiệm');
  assert.match(h, /Đúng sai: .*Trắc nghiệm: /);
});

test('2 phần cùng dạng: dòng điểm ghi "Phần I", "Phần II"; 1 phần: chỉ 1 bảng', () => {
  const h = ve([
    { ma: 'I', ten: 'TN dễ', dang: 'trac_nghiem', diem: '2.00', toiDa: '3', cau: [cau(1, 'A', 'A')] },
    { ma: 'II', ten: 'TN khó', dang: 'trac_nghiem', diem: '1.00', toiDa: '1', cau: [cau(1, 'C', 'C')] }]);
  assert.match(h, /Phần I: <span class="do">2\.00<\/span>\/3; Phần II: <span class="do">1\.00<\/span>\/1;/);
  const h1 = ve([{ ma: 'I', ten: 'Trắc nghiệm', dang: 'trac_nghiem', diem: '10.00', toiDa: '10', cau: [cau(1, 'A', 'A')] }]);
  assert.equal((h1.match(/class="bang"/g) || []).length, 1);
});

test('tên phần trong file đáp án được ưu tiên hơn tên trong cấu trúc đề', () => {
  const h = ve([{ ma: 'I', ten: 'Trắc nghiệm', dang: 'trac_nghiem', diem: '1', toiDa: '1', cau: [cau(1, 'A', 'A')] }], { tenPhan: { I: 'Câu hỏi nhiều lựa chọn' } });
  assert.ok(h.includes('PHẦN I: Câu hỏi nhiều lựa chọn'));
});

test('khối "Điểm các phần" không chọn dòng: tự động mỗi phần 1 dòng', () => {
  const d = { cham: { phan: [
    { ma: 'I', dang: 'trac_nghiem', diem: '2.00', toiDa: '3', cau: [cau(1, 'A', 'A')] },
    { ma: 'II', dang: 'trac_nghiem', diem: '1.00', toiDa: '1', cau: [cau(1, 'A', 'A')] },
    { ma: 'III', dang: 'tu_luan', diem: '3.00', toiDa: '6', cau: [cau(1, '', '1')] }], diem: { tong: '6.00', maxTong: '10' } } };
  const h = KP.dungMotKhoi('bang-diem', '', d, {});
  assert.match(h, /Phần I: .*2\.00.*\/3; Phần II: .*1\.00.*\/1; Tự luận: .*3\.00.*\/6;/);
  assert.match(KP.dungMotKhoi('phan-tich', '', d, {}), /1\. PHẦN I[\s\S]*2\. PHẦN II[\s\S]*3\. PHẦN III/);
});
