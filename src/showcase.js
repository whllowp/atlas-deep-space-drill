(function () {
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  var btn = document.getElementById('btnLive');
  var frames = document.getElementById('liveFrames');
  var live = false;

  function placeholder() {
    frames.innerHTML = '<div class="live-placeholder"><b>READY FOR LIVE LINK</b><span>点击右上角按钮加载 大厅 + 指挥席</span></div>';
  }

  function fitFrames() {
    document.querySelectorAll('.live-screen').forEach(function (wrap) {
      var frame = wrap.querySelector('iframe');
      if (!frame) return;
      var scale = wrap.clientWidth / 1280;
      frame.style.transform = 'scale(' + scale + ')';
      wrap.style.height = Math.round(900 * scale) + 'px';
    });
  }

  function setLive(on) {
    live = on;
    if (!on) {
      placeholder();
      btn.innerHTML = '<span class="ico">▶</span> 启动实时双屏';
      btn.classList.add('primary');
      return;
    }
    frames.innerHTML = [
      '<div class="live-screen"><iframe src="./index.html?hud=0&auto=1" title="大厅实时画面" allow="autoplay; fullscreen"></iframe></div>',
      '<div class="live-screen"><iframe src="./console.html" title="指挥席实时控制台" allow="autoplay"></iframe></div>'
    ].join('');
    btn.innerHTML = '■ 关闭实时双屏';
    btn.classList.remove('primary');
    fitFrames();
  }

  if (btn) {
    btn.addEventListener('click', function () { setLive(!live); });
  }
  window.addEventListener('resize', fitFrames);
})();
