/* 拆分流程：拆分四通道 → 单通道处理/导出 → 两通道合成法线贴图 */
(function () {
  'use strict';
  var T = window.TCA;
  var $ = T.$, $$ = T.$$;

  var S = {
    img: null,
    name: '',
    w: 0, h: 0,
    mode: 'gray',        // gray | color
    active: 'R',
    tab: 'channel',      // channel | normal
    format: 'image/png',
    ch: {
      R: { take: 'R', invert: false, flipH: false, flipV: false, value: 0 },
      G: { take: 'G', invert: false, flipH: false, flipV: false, value: 0 },
      B: { take: 'B', invert: false, flipH: false, flipV: false, value: 0 },
      A: { take: 'A', invert: false, flipH: false, flipV: false, value: 0 }
    },
    normal: { src1: 'R', dst1: 'R', src2: 'G', dst2: 'G', rest: 1 }
  };

  var elGrid, elDrop, elFile, elSrcInfo, elPreview, elMeta, elExportBtn, elExportAll;
  var cards = {};

  function init() {
    elGrid = $('#split-channels');
    elDrop = $('#split-drop');
    elFile = $('#split-file');
    elSrcInfo = $('[data-role="srcInfo"]', $('#view-split'));
    elPreview = $('#split-preview-canvas');
    elMeta = $('#split-meta');
    elExportBtn = $('#split-export');
    elExportAll = $('#split-export-all');

    buildCards();
    buildNormalControls();

    elDrop.addEventListener('click', function () { elFile.click(); });
    elFile.addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) load(e.target.files[0]);
      e.target.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      elDrop.addEventListener(ev, function (e) { e.preventDefault(); elDrop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      elDrop.addEventListener(ev, function (e) { e.preventDefault(); elDrop.classList.remove('over'); });
    });
    elDrop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) load(e.dataTransfer.files[0]);
    });

    // 显示方式
    $('#split-preview-mode').addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn');
      if (!b) return;
      S.mode = b.dataset.mode;
      $$('#split-preview-mode .seg-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderAll();
    });

    // 预览页签
    $('#split-tab').addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn');
      if (!b) return;
      S.tab = b.dataset.tab;
      $$('#split-tab .seg-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      renderPreview();
    });

    $('#split-format').addEventListener('change', function (e) { S.format = e.target.value; });

    elExportBtn.addEventListener('click', exportCurrent);
    elExportAll.addEventListener('click', exportAllChannels);

    renderPreview();
  }

  /* ---------- 通道卡片 ---------- */
  function buildCards() {
    elGrid.innerHTML = '';
    T.CHANNELS.forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'ch-card';
      card.dataset.ch = c.key;
      card.innerHTML =
        '<div class="ch-head">' +
          '<span class="dot" style="background:' + c.color + '"></span>' +
          '<b>' + c.key + ' · ' + c.label + '通道</b>' +
          '<span class="spacer"></span>' +
          '<button class="btn-mini" data-act="view">预览</button>' +
        '</div>' +
        '<div class="ch-canvas checker"><canvas></canvas></div>' +
        '<div class="ch-ops">' +
          '<button class="toggle" data-op="invert">反相</button>' +
          '<button class="toggle" data-op="flipH">水平翻转</button>' +
          '<button class="toggle" data-op="flipV">垂直翻转</button>' +
        '</div>' +
        '<div class="ch-ops">' +
          '<button class="btn-sm" data-act="export" style="flex:1">导出该通道</button>' +
          '<button class="btn-sm" data-act="reset">重置</button>' +
        '</div>';
      elGrid.appendChild(card);
      cards[c.key] = card;
    });

    elGrid.addEventListener('click', function (e) {
      var card = e.target.closest('.ch-card');
      if (!card) return;
      var key = card.dataset.ch;
      var actBtn = e.target.closest('[data-act]');
      var opBtn = e.target.closest('[data-op]');
      if (actBtn) {
        var act = actBtn.dataset.act;
        if (act === 'view') { selectChannel(key); }
        else if (act === 'export') { exportChannel(key); }
        else if (act === 'reset') {
          S.ch[key].invert = S.ch[key].flipH = S.ch[key].flipV = false;
          renderAll();
        }
        return;
      }
      if (opBtn) {
        var op = opBtn.dataset.op;
        S.ch[key][op] = !S.ch[key][op];
        renderAll();
        return;
      }
      selectChannel(key);
    });
  }

  function selectChannel(key) {
    S.active = key;
    S.tab = 'channel';
    $$('#split-tab .seg-btn').forEach(function (x) { x.classList.toggle('active', x.dataset.tab === 'channel'); });
    renderAll();
  }

  /* ---------- 法线设置控件 ---------- */
  function buildNormalControls() {
    var card = $('#normal-card');
    var src1 = $('[data-role="src1"]', card);
    var src2 = $('[data-role="src2"]', card);
    var dst1 = $('[data-role="dst1"]', card);
    var dst2 = $('[data-role="dst2"]', card);
    T.fillSelect(src1, T.channelOptions(), S.normal.src1);
    T.fillSelect(src2, T.channelOptions(), S.normal.src2);
    T.fillSelect(dst1, T.rgbOptions(), S.normal.dst1);
    T.fillSelect(dst2, T.rgbOptions(), S.normal.dst2);

    src1.addEventListener('change', function (e) { S.normal.src1 = e.target.value; renderPreview(); });
    src2.addEventListener('change', function (e) { S.normal.src2 = e.target.value; renderPreview(); });
    dst1.addEventListener('change', function (e) {
      S.normal.dst1 = e.target.value;
      if (S.normal.dst1 === S.normal.dst2) S.normal.dst2 = firstFree(S.normal.dst1);
      dst2.value = S.normal.dst2;
      renderPreview();
    });
    dst2.addEventListener('change', function (e) {
      S.normal.dst2 = e.target.value;
      if (S.normal.dst1 === S.normal.dst2) S.normal.dst1 = firstFree(S.normal.dst2);
      dst1.value = S.normal.dst1;
      renderPreview();
    });
    $('[data-role="rest"]', card).addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn');
      if (!b) return;
      S.normal.rest = Number(b.dataset.val);
      $$('[data-role="rest"] .seg-btn', card).forEach(function (x) { x.classList.toggle('active', x === b); });
      renderPreview();
    });
  }
  function firstFree(used) {
    var all = ['R', 'G', 'B'];
    for (var i = 0; i < all.length; i++) if (all[i] !== used) return all[i];
    return 'B';
  }

  /* ---------- 载入 ---------- */
  function load(file) {
    T.loadImageFromFile(file).then(function (r) {
      S.img = r.img;
      S.name = r.name;
      S.w = r.img.naturalWidth;
      S.h = r.img.naturalHeight;
      elSrcInfo.textContent = r.name + ' · ' + S.w + ' × ' + S.h;
      renderAll();
      T.toast('已载入贴图');
    }).catch(function (err) {
      T.toast(err.message || '载入失败');
    });
  }

  /* ---------- 渲染 ---------- */
  function renderAll() {
    renderCards();
    renderPreview();
  }

  function renderCards() {
    if (!S.img) {
      T.CHANNELS.forEach(function (c) {
        var cv = $('canvas', cards[c.key]);
        cv.width = 1; cv.height = 1;
        cv.style.aspectRatio = '1 / 1';
        cards[c.key].classList.remove('sel');
      });
      return;
    }
    var ps = T.fitSize(S.w, S.h, 300);
    T.CHANNELS.forEach(function (c) {
      var slot = S.ch[c.key];
      slot.img = S.img;
      var vals = T.readSlot(slot, ps.w, ps.h);
      var out = T.channelToCanvas(vals, ps.w, ps.h, c.key, S.mode);
      var cv = $('canvas', cards[c.key]);
      cv.width = out.width; cv.height = out.height;
      cv.getContext('2d').drawImage(out, 0, 0);
      cv.style.aspectRatio = S.w + ' / ' + S.h;
      cards[c.key].classList.toggle('sel', S.active === c.key);
      $$('.toggle', cards[c.key]).forEach(function (b) {
        b.classList.toggle('on', !!slot[b.dataset.op]);
      });
    });
  }

  function buildNormalCanvas(w, h) {
    if (!S.img) return null;
    var n = S.normal;
    var i1 = T.chInfo(n.dst1).idx, i2 = T.chInfo(n.dst2).idx;
    if (i1 === i2) { i2 = (i1 + 1) % 3; }
    var vals = [null, null, null];
    vals[i1] = T.readSlot(slotOf(n.src1), w, h);
    vals[i2] = T.readSlot(slotOf(n.src2), w, h);
    var restIdx = [0, 1, 2].filter(function (i) { return i !== i1 && i !== i2; })[0];
    var fill = new Uint8ClampedArray(w * h);
    fill.fill(n.rest === 1 ? 255 : 0);
    vals[restIdx] = fill;
    var alpha = new Uint8ClampedArray(w * h);
    alpha.fill(255);
    return T.composeCanvas([vals[0], vals[1], vals[2], alpha], w, h);
  }

  function slotOf(key) {
    var s = S.ch[key];
    s.img = S.img;
    return s;
  }

  function renderPreview() {
    var has = !!S.img;
    elExportBtn.disabled = !has;
    if (!has) {
      elPreview.width = 1; elPreview.height = 1;
      elPreview.getContext('2d').clearRect(0, 0, 1, 1);
      elMeta.textContent = '载入贴图后显示';
      elExportBtn.textContent = '导出';
      return;
    }
    var ps = T.fitSize(S.w, S.h, 520);
    var out;
    if (S.tab === 'normal') {
      out = buildNormalCanvas(ps.w, ps.h);
      elMeta.textContent = '法线图 ' + S.normal.dst1 + '←' + S.normal.src1 + '，' +
        S.normal.dst2 + '←' + S.normal.src2 + '，空余填 ' + S.normal.rest + ' · ' + S.w + ' × ' + S.h;
      elExportBtn.textContent = '导出法线贴图';
    } else {
      var slot = slotOf(S.active);
      var vals = T.readSlot(slot, ps.w, ps.h);
      out = T.channelToCanvas(vals, ps.w, ps.h, S.active, S.mode);
      elMeta.textContent = S.active + ' 通道 · ' + S.w + ' × ' + S.h +
        (S.mode === 'color' ? ' · 彩色显示' : ' · 灰度显示');
      elExportBtn.textContent = '导出 ' + S.active + ' 通道';
    }
    elPreview.width = out.width;
    elPreview.height = out.height;
    elPreview.getContext('2d').drawImage(out, 0, 0);
  }

  /* ---------- 导出 ---------- */
  function exportChannel(key) {
    if (!S.img) { T.toast('请先载入贴图'); return; }
    var slot = slotOf(key);
    var vals = T.readSlot(slot, S.w, S.h);
    var cv = T.channelToCanvas(vals, S.w, S.h, key, S.mode);
    var ext = S.format === 'image/jpeg' ? '.jpg' : '.png';
    T.download(cv, T.safeName(S.name) + '_' + key + ext, S.format).then(function () {
      T.toast('已导出 ' + key + ' 通道');
    }).catch(function () { T.toast('导出失败'); });
  }

  function exportAllChannels() {
    if (!S.img) { T.toast('请先载入贴图'); return; }
    var ext = S.format === 'image/jpeg' ? '.jpg' : '.png';
    var base = T.safeName(S.name);
    var keys = ['R', 'G', 'B', 'A'];
    var i = 0;
    (function next() {
      if (i >= keys.length) { T.toast('已导出 4 个通道'); return; }
      var k = keys[i++];
      var vals = T.readSlot(slotOf(k), S.w, S.h);
      var cv = T.channelToCanvas(vals, S.w, S.h, k, S.mode);
      T.download(cv, base + '_' + k + ext, S.format).then(next).catch(function () { T.toast('导出失败'); });
    })();
  }

  function exportNormal() {
    if (!S.img) { T.toast('请先载入贴图'); return; }
    var cv = buildNormalCanvas(S.w, S.h);
    var ext = S.format === 'image/jpeg' ? '.jpg' : '.png';
    T.download(cv, T.safeName(S.name) + '_normal' + ext, S.format).then(function () {
      T.toast('已导出法线贴图');
    }).catch(function () { T.toast('导出失败'); });
  }

  function exportCurrent() {
    if (S.tab === 'normal') exportNormal(); else exportChannel(S.active);
  }

  window.SplitView = { init: init };
})();
