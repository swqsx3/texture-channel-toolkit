/* 视图切换与初始化 */
(function () {
  'use strict';
  var T = window.TCA;
  var $ = T.$, $$ = T.$$;

  function show(name) {
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + name); });
    $$('.topnav .btn').forEach(function (b) { b.classList.toggle('primary', b.dataset.nav === name); });
    window.scrollTo(0, 0);
  }

  function bind() {
    $$('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () { show(b.dataset.nav); });
    });
    $('#btn-home').addEventListener('click', function () { show('home'); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    window.SplitView.init();
    window.MergeView.init();
    show('home');
  });
})();
