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
  const sel = '.content > *:not(.gallery), .gallery > h2, .grid .card, .pager, .foot';
  const items = [...document.querySelectorAll(sel)];
  const vh = innerHeight;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  items.forEach((el) => {
    if (el.getBoundingClientRect().top < vh * 0.92) return; // đang trong màn hình
    const grid = el.closest('.grid');
    if (grid) el.style.transitionDelay = ([...grid.children].indexOf(el) % 4) * 80 + 'ms';
    el.classList.add('rv');
    io.observe(el);
  });
})();
