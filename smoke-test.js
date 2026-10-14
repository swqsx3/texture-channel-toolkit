/* 临时自测：用桩件模拟 canvas，校验 core.js 的像素逻辑 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---- 源图：R=x, G=y, B=128, A=255（4x2） ---- */
const SRC_W = 4, SRC_H = 2;
function srcPixel(u, v) {
  const x = Math.min(SRC_W - 1, Math.max(0, Math.floor(u)));
  const y = Math.min(SRC_H - 1, Math.max(0, Math.floor(v)));
  return [x * 60, y * 100, 128, 255];
}

function makeCtx(canvas) {
  let t = { a: 1, d: 1, e: 0, f: 0 };
  const stack = [];
  const ctx = {
    imageSmoothingEnabled: true, imageSmoothingQuality: 'high', fillStyle: '#fff',
    save() { stack.push(Object.assign({}, t)); },
    restore() { t = stack.pop() || { a: 1, d: 1, e: 0, f: 0 }; },
    translate(x, y) { t.e += t.a * x; t.f += t.d * y; },
    scale(x, y) { t.a *= x; t.d *= y; },
    fillRect() {}, drawImage() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData(id) { canvas._data = id.data; canvas._painted = true; },
    getImageData(x, y, w, h) {
      if (canvas._painted) return { width: w, height: h, data: canvas._data };
      return sample(w, h);
    }
  };
  // 真实 canvas 会把绘制结果落盘（restore 之后仍然保留），桩件同样记录到 _data
  function sample(w, h) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let Y = 0; Y < h; Y++) {
      for (let X = 0; X < w; X++) {
        const u = (X + 0.5 - t.e) / t.a * (SRC_W / w);
        const v = (Y + 0.5 - t.f) / t.d * (SRC_H / h);
        const p = srcPixel(u, v);
        const i = (Y * w + X) * 4;
        data[i] = p[0]; data[i + 1] = p[1]; data[i + 2] = p[2]; data[i + 3] = p[3];
      }
    }
    return { width: w, height: h, data };
  }
  ctx.drawImage = function (img, dx, dy, dw, dh) {
    canvas._data = sample(dw, dh).data;
    canvas._painted = true;
  };
  return ctx;
}

const documentStub = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement(tag) {
    const c = { width: 300, height: 150, _data: null };
    c.getContext = () => (c._ctx = c._ctx || makeCtx(c));
    c.toBlob = (cb) => cb({ size: 1 });
    return c;
  },
  body: { appendChild() {} }
};

const sandbox = {
  window: {}, document: documentStub, Image: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  console, Promise, setTimeout, clearTimeout, Math, Uint8ClampedArray, Number, parseInt, Array, String, RegExp, Error
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js', 'core.js'), 'utf8'), sandbox);
const T = sandbox.TCA;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function arr(a) { return Array.prototype.slice.call(a); }

const img = { naturalWidth: SRC_W, naturalHeight: SRC_H };

console.log('\n[取通道]');
let v = T.readSlot({ img, take: 'R' }, SRC_W, SRC_H);
check('R 通道 = x 方向梯度', arr(v).join(',') === '0,60,120,180,0,60,120,180', arr(v).join(','));
v = T.readSlot({ img, take: 'G' }, SRC_W, SRC_H);
check('G 通道 = y 方向梯度', arr(v).join(',') === '0,0,0,0,100,100,100,100', arr(v).join(','));
check('B 通道恒为 128', arr(T.readSlot({ img, take: 'B' }, SRC_W, SRC_H)).every(x => Math.abs(x - 128) <= 1));
check('A 通道恒为 255', arr(T.readSlot({ img, take: 'A' }, SRC_W, SRC_H)).every(x => x === 255));
check('亮度 ≈ 0.299R+0.587G+0.114B', Math.abs(T.readSlot({ img, take: 'L' }, SRC_W, SRC_H)[3] - (0.299 * 180 + 0.114 * 128)) < 2);

console.log('\n[反相 / 翻转]');
check('反相 R', arr(T.readSlot({ img, take: 'R', invert: true }, SRC_W, SRC_H)).join(',') === '255,195,135,75,255,195,135,75');
check('水平翻转 R', arr(T.readSlot({ img, take: 'R', flipH: true }, SRC_W, SRC_H)).join(',') === '180,120,60,0,180,120,60,0');
check('垂直翻转 G', arr(T.readSlot({ img, take: 'G', flipV: true }, SRC_W, SRC_H)).join(',') === '100,100,100,100,0,0,0,0');

console.log('\n[颜色填充]');
check('常量 128 填充', arr(T.readSlot({ value: 128 }, 2, 2)).every(x => x === 128));
check('常量反相', arr(T.readSlot({ value: 200, invert: true }, 2, 2)).every(x => x === 55));

console.log('\n[合成 / 预览]');
const cv = T.composeCanvas([
  T.readSlot({ img, take: 'R' }, SRC_W, SRC_H),
  T.readSlot({ img, take: 'G' }, SRC_W, SRC_H),
  T.readSlot({ value: 0 }, SRC_W, SRC_H),
  T.readSlot({ value: 255 }, SRC_W, SRC_H)
], SRC_W, SRC_H);
const d = cv._data;
check('合成后首像素 RGB = 0,0,0', d[0] === 0 && d[1] === 0 && d[2] === 0);
check('合成后末像素 RGB = 180,100,0', d[28] === 180 && d[29] === 100 && d[30] === 0);
check('合成后 alpha 全 255', arr(d).filter((_, i) => i % 4 === 3).every(x => x === 255));

const pc = T.channelToCanvas(T.readSlot({ img, take: 'R' }, SRC_W, SRC_H), SRC_W, SRC_H, 'G', 'color');
check('彩色显示把值放进指定通道', pc._data[0] === 0 && pc._data[1] === 0 && pc._data[2] === 0 && pc._data[4] === 0 && pc._data[5] === 60);
const pg = T.channelToCanvas(T.readSlot({ img, take: 'R' }, SRC_W, SRC_H), SRC_W, SRC_H, 'R', 'gray');
check('灰度显示三通道相同', pg._data[0] === 0 && pg._data[1] === 0 && pg._data[2] === 0 && pg._data[4] === 60 && pg._data[5] === 60);

console.log('\n[工具函数]');
check('fitSize 等比', T.fitSize(2000, 1000, 500).w === 500 && T.fitSize(2000, 1000, 500).h === 250);
check('luminance 白 = 255', T.luminance('#ffffff') === 255);
check('luminance 黑 = 0', T.luminance('#000000') === 0);
check('valueToHex 128', T.valueToHex(128) === '#808080');
check('clamp255 越界', T.clamp255(-5) === 0 && T.clamp255(300) === 255);
check('safeName 去扩展名', T.safeName('a.b_c.png') === 'a.b_c');

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败\n');
process.exit(fail ? 1 : 0);
