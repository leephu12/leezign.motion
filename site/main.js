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

// Chuyển động theo cuộn: cuộn tới đâu hiện tới đó (trượt lên + rõ dần), chữ sáng dần từng từ. Có làm mượt (lerp) để không giật.
(() => {
  const root = document.documentElement;
  const setVw = () => root.style.setProperty('--vw', root.clientWidth + 'px');
  setVw(); addEventListener('resize', setVw);

  // 1) Tách chữ thành từng từ (giữ nguyên link, chữ đậm…)
  const wordSel = '.content > p, .content > h2:not(.group-title):not(.gallery-title), .content > h3, .content > blockquote, .ab-body > p, .cta > p:not(.more), .cta > h2, .cta > h3, .callout-video > p';
  const splitWords = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    let count = 0;
    for (const t of nodes) {
      if (!t.nodeValue.trim() || t.parentElement.closest('.btn, .roll, sup')) continue;
      const frag = document.createDocumentFragment();
      for (const part of t.nodeValue.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const w = document.createElement('span'); w.className = 'w'; w.textContent = part; frag.appendChild(w); count++;
      }
      t.replaceWith(frag);
    }
    return count;
  };
  const items = [];
  document.querySelectorAll(wordSel).forEach((el) => {
    if (el.closest('.card, .link-card, .num-row, .big-links, .tag-row') || el.classList.contains('more')) return;
    if (el.textContent.trim().split(/\s+/).length < 4) return;
    if (splitWords(el)) items.push({ el, kind: 'words', words: [...el.querySelectorAll('.w')], cur: -1 });
  });
  // 2) Khối (ảnh, video, thẻ dự án, tiêu đề…) trượt lên + rõ dần
  const blockSel = '.content > *:not(.gallery):not(.cta):not(.ab-contact), .gallery > h2, .grid .card, .ab-wide, .ab-row';
  document.querySelectorAll(blockSel).forEach((el) => {
    if (items.some((x) => x.el === el)) return;
    if (el.parentElement.closest('.ab-row') && !el.matches('.grid .card')) return;
    items.push({ el, kind: 'block', cur: -1 });
  });

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  let raf = 0;
  const frame = () => {
    raf = 0;
    const vh = innerHeight;
    const atEnd = innerHeight + scrollY >= root.scrollHeight - 4;
    const rects = items.map((it) => it.el.getBoundingClientRect()); // đọc trước, ghi sau (tránh giật)
    let moving = false;
    items.forEach((it, i) => {
      const r = rects[i];
      let target;
      if (it.kind === 'words') target = clamp((vh * 0.92 - r.top) / (vh * 0.4 + r.height * 0.6));
      else target = clamp((vh * 1.02 - r.top) / (vh * 0.3));
      if (atEnd) target = 1;
      if (it.cur < 0) it.cur = target; // lần đầu: đặt ngay, không chạy
      const next = it.cur + (target - it.cur) * 0.16;
      it.cur = Math.abs(target - next) < 0.002 ? target : next;
      if (it.cur !== target) moving = true;
      if (r.bottom < -200 || r.top > vh + 200) { if (it.kind === 'block') it.el.style.opacity = it.cur < 1 ? 0 : ''; return; }
      if (it.kind === 'block') {
        const e = ease(it.cur);
        it.el.style.opacity = e >= 1 ? '' : e.toFixed(3);
        it.el.style.transform = e >= 1 ? '' : `translate3d(0, ${((1 - e) * 56).toFixed(1)}px, 0)`;
      } else {
        const n = it.words.length, pos = it.cur * (n + 3);
        it.words.forEach((w, k) => { const o = 0.16 + 0.84 * clamp(pos - k); w.style.opacity = o >= 1 ? '' : o.toFixed(3); });
      }
    });
    if (moving) raf = requestAnimationFrame(frame);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick);
  addEventListener('load', kick);
  frame();
})();

// Video Dropbox không phát được (link đang giới hạn quyền xem/tải) → hiện nút mở video trên Dropbox thay vì khung đen
(() => {
  document.querySelectorAll('.content video[src*="dropbox"]').forEach((v) => {
    if (v.closest('.thumb')) return;
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
