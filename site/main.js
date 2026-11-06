// Video chỉ chạy khi nằm trong màn hình (tiết kiệm pin & băng thông, giống GIF)
(() => {
  const vids = document.querySelectorAll('video[autoplay]');
  if (!('IntersectionObserver' in window)) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) v.play().catch(() => {});
      else if (!v.dataset.userPlayed) v.pause();
    }
  }, { rootMargin: '120px' });
  vids.forEach((v) => {
    v.pause();
    // Người xem tự bấm play/unmute thì không tự dừng nữa
    v.addEventListener('volumechange', () => { if (!v.muted) v.dataset.userPlayed = '1'; });
    io.observe(v);
  });
})();

// Hiệu ứng trượt lên + hiện dần khi cuộn tới (phần đã thấy lúc mở trang thì giữ nguyên, không nháy)
(() => {
  if (!('IntersectionObserver' in window)) return;
  const sel = '.content > *:not(.gallery):not(.ab-contact), .gallery > h2, .grid .card';
  const items = [...document.querySelectorAll(sel)];
  const vh = innerHeight;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px', threshold: 0 });
  items.forEach((el) => {
    if (el.getBoundingClientRect().top < vh * 0.92) return; // đang trong màn hình
    const grid = el.closest('.grid');
    if (grid) el.style.transitionDelay = ([...grid.children].indexOf(el) % 4) * 80 + 'ms';
    el.classList.add('rv');
    io.observe(el);
  });
})();

// Video Dropbox không phát được (link đang giới hạn quyền xem/tải) → hiện nút mở video trên Dropbox thay vì khung đen
(() => {
  document.querySelectorAll('video[src*="dropbox"]').forEach((v) => {
    const fail = () => {
      const u = new URL(v.src); u.searchParams.delete('raw'); u.searchParams.set('dl', '0');
      const a = document.createElement('a');
      a.className = 'bookmark video-fallback'; a.href = u.href; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = '<span>▶ Xem video trên Dropbox</span><span class="arrow">↗</span>';
      v.replaceWith(a);
    };
    v.addEventListener('error', fail);
    if (v.error) fail();
  });
})();

// Video trong bài chạy như GIF (không thanh điều khiển). Rê chuột / chạm vào mới hiện thanh điều khiển để bật tiếng, tua…
(() => {
  document.querySelectorAll('.content video[controls]').forEach((v) => {
    v.controls = false;
    const show = () => { v.controls = true; };
    const hide = () => { if (!v.dataset.userPlayed && v.muted) v.controls = false; };
    v.addEventListener('mouseenter', show);
    v.addEventListener('mouseleave', hide);
    v.addEventListener('focus', show);
    v.addEventListener('touchstart', show, { passive: true });
  });
})();

// Chữ liên hệ lớn (About): chữ gần con trỏ đậm dần lên như sóng
(() => {
  const lists = document.querySelectorAll('.big-links');
  if (!lists.length) return;
  const chars = [...document.querySelectorAll('.big-links .wave span:not(.sp)')];
  const MIN = 300, MAX = 800, R = 140;
  let raf = 0, mx = -1e4, my = -1e4;
  const paint = () => {
    raf = 0;
    for (const c of chars) {
      const r = c.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - mx, r.top + r.height / 2 - my);
      const w = Math.round(MIN + (MAX - MIN) * Math.max(0, 1 - d / R));
      c.style.fontVariationSettings = `'wght' ${w}`;
    }
  };
  addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(paint); }, { passive: true });
  document.addEventListener('mouseleave', () => { mx = my = -1e4; if (!raf) raf = requestAnimationFrame(paint); });
})();
