/* 合并流程：R/G/B/A 四个槽位 → 各自贴图或颜色填充 → 导出合并贴图 */
(function () {
  'use strict';
  var T = window.TCA;
  var $ = T.$, $$ = T.$$;

  var DEF = { R: 0, G: 0, B: 0, A: 255 };

  var slots = {
    R: mk('R'), G: mk('G'), B: mk('B'), A: mk('A')
  };
  function mk(key) {
    return {
      img: null, name: '', take: key,
      invert: false, flipH: false, flipV: false,
      value: DEF[key], color: T.valueToHex(DEF[key])
    };
  }

  var size = { w: 512, h: 512, manual: false };
  var format = 'image/png';
  var elGrid, elPreview, elMeta, elW, elH, cards = {};

  function init() {
    elGrid = $('#merge-channels');
    elPreview = $('#merge-preview-canvas');
    elMeta = $('#merge-meta');
    elW = $('#merge-w');
    elH = $('#merge-h');

    buildCards();

    $('#merge-reset').addEventListener('click', function () {
      T.CHANNELS.forEach(function (c) { slots[c.key] = mk(c.key); });
      size.manual = false;
      syncSizeInputs();
      renderAll();
      T.toast('已重置全部槽位');
    });
    $('#merge-size-auto').addEventListener('click', function () {
      size.manual = false;
      autoSize();
      syncSizeInputs();
      renderAll();
    });
    elW.addEventListener('input', function () { size.w = clampDim(elW.value); size.manual = true; renderPreview(); });
    elH.addEventListener('input', function () { size.h = clampDim(elH.value); size.manual = true; renderPreview(); });
    $('#merge-format').addEventListener('change', function (e) { format = e.target.value; });
    $('#merge-export').addEventListener('click', exportMerged);

    syncSizeInputs();
    renderAll();
  }
  function clampDim(v) {
    v = parseInt(v, 10);
    if (!isFinite(v) || v < 1) v = 1;
    if (v > 16384) v = 16384;
    return v;
  }
  function autoSize() {
    var w = 0, h = 0, any = false;
    T.CHANNELS.forEach(function (c) {
      var s = slots[c.key];
      if (s.img) { any = true; w = Math.max(w, s.img.naturalWidth); h = Math.max(h, s.img.naturalHeight); }
    });
    size.w = any ? w : 512;
    size.h = any ? h : 512;
  }
  function syncSizeInputs() { elW.value = size.w; elH.value = size.h; }

  /* ---------- 槽位卡片 ---------- */
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
          '<span class="tag" data-role="state">颜色</span>' +
        '</div>' +
        '<div class="ch-canvas checker"><canvas></canvas></div>' +
        '<div class="ch-ops">' +
          '<button class="btn-sm" data-act="pick" style="flex:1">选择贴图</button>' +
          '<button class="btn-sm" data-act="clear">清除</button>' +
        '</div>' +
        '<div class="ch-row">' +
          '<label>取值</label>' +
          '<select data-role="take"></select>' +
        '</div>' +
        '<div class="ch-ops">' +
          '<button class="toggle" data-op="invert">反相</button>' +
          '<button class="toggle" data-op="flipH">水平翻转</button>' +
          '<button class="toggle" data-op="flipV">垂直翻转</button>' +
        '</div>' +
        '<div class="ch-row">' +
          '<label>填充</label>' +
          '<input type="color" data-role="color" />' +
          '<input type="number" data-role="value" min="0" max="255" step="1" />' +
        '</div>';
      elGrid.appendChild(card);
      cards[c.key] = card;

      var sel = $('[data-role="take"]', card);
      T.fillSelect(sel, T.TAKE_OPTIONS, slots[c.key].take);
      sel.addEventListener('change', function (e) { slots[c.key].take = e.target.value; renderAll(); });

      $('[data-role="color"]', card).addEventListener('input', function (e) {
        var s = slots[c.key];
        s.color = e.target.value;
        s.value = T.luminance(s.color);
        $('[data-role="value"]', card).value = s.value;
        if (!s.img) renderAll();
      });
      $('[data-role="value"]', card).addEventListener('input', function (e) {
        var s = slots[c.key];
        s.value = T.clamp255(e.target.value);
        s.color = T.valueToHex(s.value);
        $('[data-role="color"]', card).value = s.color;
        if (!s.img) renderAll();
      });

      // 拖放
      ['dragenter', 'dragover'].forEach(function (ev) {
        card.addEventListener(ev, function (e) { e.preventDefault(); card.classList.add('over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        card.addEventListener(ev, function (e) { e.preventDefault(); card.classList.remove('over'); });
      });
      card.addEventListener('drop', function (e) {
        if (e.dataTransfer.files && e.dataTransfer.files[0]) loadInto(c.key, e.dataTransfer.files[0]);
      });
    });

    elGrid.addEventListener('click', function (e) {
      var card = e.target.closest('.ch-card');
      if (!card) return;
      var key = card.dataset.ch;
      var opBtn = e.target.closest('[data-op]');
      if (opBtn) {
        slots[key][opBtn.dataset.op] = !slots[key][opBtn.dataset.op];
        renderAll();
        return;
      }
      var actBtn = e.target.closest('[data-act]');
      if (!actBtn) return;
      if (actBtn.dataset.act === 'pick') pickFile(key);
      else if (actBtn.dataset.act === 'clear') {
        var s = slots[key];
        s.img = null; s.name = '';
        if (!size.manual) autoSize();
        syncSizeInputs();
        renderAll();
      }
    });
  }

  function pickFile(key) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) loadInto(key, input.files[0]);
      input.remove();
    });
    input.click();
  }

  function loadInto(key, file) {
    T.loadImageFromFile(file).then(function (r) {
      var s = slots[key];
      s.img = r.img;
      s.name = r.name;
      if (!size.manual) autoSize();
      syncSizeInputs();
      renderAll();
      T.toast(key + ' 槽位已载入 ' + r.name);
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
    var ps = T.fitSize(size.w, size.h, 260);
    T.CHANNELS.forEach(function (c) {
      var card = cards[c.key], s = slots[c.key];
      var vals = T.readSlot(s, ps.w, ps.h);
      var out = T.channelToCanvas(vals, ps.w, ps.h, c.key, 'color');
      var cv = $('canvas', card);
      cv.width = out.width; cv.height = out.height;
      cv.getContext('2d').drawImage(out, 0, 0);
      cv.style.aspectRatio = size.w + ' / ' + size.h;

      $('[data-role="state"]', card).textContent = s.img ? ('贴图 · ' + s.name) : ('颜色 ' + s.value);
      $('[data-role="take"]', card).value = s.take;
      $('[data-role="take"]', card).disabled = !s.img;
      $('[data-role="color"]', card).value = s.color;
      $('[data-role="value"]', card).value = s.value;
      $$('.toggle', card).forEach(function (b) { b.classList.toggle('on', !!s[b.dataset.op]); });
    });
  }

  function buildMerged(w, h) {
    var vals = T.CHANNELS.map(function (c) { return T.readSlot(slots[c.key], w, h); });
    return T.composeCanvas(vals, w, h);
  }

  function renderPreview() {
    var ps = T.fitSize(size.w, size.h, 520);
    var out = buildMerged(ps.w, ps.h);
    elPreview.width = out.width;
    elPreview.height = out.height;
    elPreview.getContext('2d').drawImage(out, 0, 0);

    var parts = T.CHANNELS.map(function (c) {
      var s = slots[c.key];
      var src = s.img ? (s.name + '.' + s.take + (s.invert ? '·反相' : '')) : ('色' + s.value);
      return c.key + '=' + src;
    });
    elMeta.textContent = size.w + ' × ' + size.h + ' ｜ ' + parts.join('  ');
  }

  /* ---------- 导出 ---------- */
  function exportMerged() {
    var w = clampDim(elW.value), h = clampDim(elH.value);
    size.w = w; size.h = h;
    syncSizeInputs();
    var cv = buildMerged(w, h);
    var ext = format === 'image/jpeg' ? '.jpg' : '.png';
    var base = null;
    T.CHANNELS.forEach(function (c) { if (!base && slots[c.key].name) base = slots[c.key].name; });
    var filename = (base ? T.safeName(base) : 'texture') + '_merged' + ext;
    T.download(cv, filename, format).then(function () {
      T.toast('已导出合并贴图 · ' + w + ' × ' + h);
    }).catch(function () { T.toast('导出失败'); });
  }

  window.MergeView = { init: init };
})();
