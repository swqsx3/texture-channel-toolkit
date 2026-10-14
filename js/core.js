/* 贴图通道工具箱 - 核心能力：像素读写 / 通道提取 / 合成 / 导出 */
window.TCA = (function () {
  'use strict';

  var CHANNELS = [
    { key: 'R', idx: 0, label: '红',   color: '#e5484d' },
    { key: 'G', idx: 1, label: '绿',   color: '#30a46c' },
    { key: 'B', idx: 2, label: '蓝',   color: '#3e63dd' },
    { key: 'A', idx: 3, label: '透明', color: '#8b8d98' }
  ];

  var TAKE_OPTIONS = [
    { v: 'R', t: 'R 通道' },
    { v: 'G', t: 'G 通道' },
    { v: 'B', t: 'B 通道' },
    { v: 'A', t: 'A 通道' },
    { v: 'L', t: '亮度' }
  ];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function chInfo(key) {
    for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].key === key) return CHANNELS[i];
    return CHANNELS[0];
  }
  function createCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* ---------- 载入图片 ---------- */
  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) { reject(new Error('不是图片文件')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url, name: file.name }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('无法解析该图片')); };
      img.src = url;
    });
  }

  /* ---------- 按翻转设置把图片画到指定尺寸 ---------- */
  function drawToCanvas(img, w, h, ops) {
    var c = createCanvas(w, h);
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.save();
    if (ops && (ops.flipH || ops.flipV)) {
      ctx.translate(ops.flipH ? w : 0, ops.flipV ? h : 0);
      ctx.scale(ops.flipH ? -1 : 1, ops.flipV ? -1 : 1);
    }
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();
    return ctx.getImageData(0, 0, w, h);
  }

  /* ---------- 从图像数据里取出单个通道 ---------- */
  function extractChannel(imgData, take) {
    var d = imgData.data, n = d.length / 4;
    var out = new Uint8ClampedArray(n);
    for (var i = 0, p = 0; i < n; i++, p += 4) {
      switch (take) {
        case 'R': out[i] = d[p]; break;
        case 'G': out[i] = d[p + 1]; break;
        case 'B': out[i] = d[p + 2]; break;
        case 'A': out[i] = d[p + 3]; break;
        default:  out[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      }
    }
    return out;
  }

  /* ---------- 读取一个槽位在某尺寸下的单通道数值 ----------
     slot: { img, take, invert, flipH, flipV, value }  */
  function readSlot(slot, w, h) {
    var out, i;
    if (slot.img) {
      var id = drawToCanvas(slot.img, w, h, slot);
      out = extractChannel(id, slot.take);
    } else {
      out = new Uint8ClampedArray(w * h);
      out.fill(clamp255(slot.value));
    }
    if (slot.invert) for (i = 0; i < out.length; i++) out[i] = 255 - out[i];
    return out;
  }

  function clamp255(v) { v = Number(v) || 0; return v < 0 ? 0 : (v > 255 ? 255 : Math.round(v)); }

  /* ---------- 单通道数值 → 预览画布 ---------- */
  function channelToCanvas(values, w, h, chKey, mode) {
    var c = createCanvas(w, h);
    var ctx = c.getContext('2d');
    var id = ctx.createImageData(w, h);
    var d = id.data;
    var idx = chInfo(chKey).idx;
    for (var i = 0, p = 0; i < values.length; i++, p += 4) {
      var v = values[i];
      if (mode === 'color') { d[p] = 0; d[p + 1] = 0; d[p + 2] = 0; d[p + idx] = v; }
      else { d[p] = v; d[p + 1] = v; d[p + 2] = v; }
      d[p + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  /* ---------- 四个通道数值 → RGBA 画布 ---------- */
  function composeCanvas(vals, w, h) {
    var c = createCanvas(w, h);
    var ctx = c.getContext('2d');
    var id = ctx.createImageData(w, h);
    var d = id.data;
    var r = vals[0], g = vals[1], b = vals[2], a = vals[3];
    for (var i = 0, p = 0; i < w * h; i++, p += 4) {
      d[p] = r[i]; d[p + 1] = g[i]; d[p + 2] = b[i]; d[p + 3] = a[i];
    }
    ctx.putImageData(id, 0, 0);
    return c;
  }

  /* ---------- 亮度 ---------- */
  function luminance(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return clamp255(0.299 * r + 0.587 * g + 0.114 * b);
  }
  function valueToHex(v) {
    v = clamp255(v);
    var s = v.toString(16);
    if (s.length < 2) s = '0' + s;
    return '#' + s + s + s;
  }

  /* ---------- 等比缩放到预览尺寸 ---------- */
  function fitSize(w, h, max) {
    var s = Math.min(1, max / Math.max(w, h || w));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }

  /* ---------- 导出 ---------- */
  function toBlob(canvas, type, quality) {
    return new Promise(function (res) { canvas.toBlob(res, type, quality); });
  }
  function flattenOnWhite(canvas) {
    var c = createCanvas(canvas.width, canvas.height);
    var x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(canvas, 0, 0);
    return c;
  }
  function download(canvas, filename, type) {
    var isJpg = type === 'image/jpeg';
    var src = isJpg ? flattenOnWhite(canvas) : canvas;
    return toBlob(src, isJpg ? 'image/jpeg' : 'image/png', 0.95).then(function (blob) {
      if (!blob) throw new Error('导出失败');
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    });
  }
  function safeName(name) {
    return String(name || 'texture').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_');
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------- 下拉选项 ---------- */
  function fillSelect(sel, options, value) {
    sel.innerHTML = options.map(function (o) {
      return '<option value="' + o.v + '">' + o.t + '</option>';
    }).join('');
    if (value !== undefined) sel.value = value;
  }
  function channelOptions() {
    return CHANNELS.map(function (c) { return { v: c.key, t: c.key + ' · ' + c.label + '通道' }; });
  }
  function rgbOptions() {
    return CHANNELS.slice(0, 3).map(function (c) { return { v: c.key, t: c.key + ' 通道' }; });
  }

  return {
    CHANNELS: CHANNELS, TAKE_OPTIONS: TAKE_OPTIONS,
    $: $, $$: $$, chInfo: chInfo, createCanvas: createCanvas,
    loadImageFromFile: loadImageFromFile, drawToCanvas: drawToCanvas,
    extractChannel: extractChannel, readSlot: readSlot,
    channelToCanvas: channelToCanvas, composeCanvas: composeCanvas,
    luminance: luminance, valueToHex: valueToHex, clamp255: clamp255,
    fitSize: fitSize, download: download, safeName: safeName, toast: toast,
    fillSelect: fillSelect, channelOptions: channelOptions, rgbOptions: rgbOptions
  };
})();
