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
  // Điện thoại (VD iPhone bật Tiết kiệm pin) có thể chặn tự chạy → chạm/cuộn lần đầu thì phát các video đang thấy
  const kickVisible = () => vids.forEach((v) => {
    const r = v.getBoundingClientRect();
    if (v.paused && r.bottom > 0 && r.top < innerHeight) v.play().catch(() => {});
  });
  ['touchstart', 'click', 'scroll'].forEach((ev) => addEventListener(ev, kickVisible, { passive: true, once: ev !== 'scroll' }));
  let st = 0; addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(kickVisible, 200); }, { passive: true });
})();

// Chiều cao thanh menu → để hàng nút danh mục ghim ngay bên dưới
(() => {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const set = () => document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
  set(); addEventListener('resize', set);
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
  // 2) Khối trượt lên + rõ dần theo cuộn (lần lượt từng thẻ trong hàng); ảnh/video/hàng dự án phóng to khi tới giữa màn hình rồi thu lại khi cuộn qua
  const blockSel = '.content > *:not(.gallery):not(.cta):not(.ab-contact):not(.globe-scene):not(.tag-row), .gallery > h2, .grid .card, .ab-wide, .ab-row, .cover';
  const scaleSel = '.cover, .ab-wide, .content > figure.media, .callout-video, .grid .row';
  const find = (el) => items.find((x) => x.el === el);
  document.querySelectorAll(blockSel).forEach((el) => {
    if (find(el)) return;
    if (el.parentElement.closest('.ab-row') && !el.matches('.grid .card')) return;
    const row = el.matches('.grid .card') ? el.parentElement : null;
    items.push({ el, kind: 'block', cur: 0, delay: row ? [...row.children].indexOf(el) : 0 });
  });
  // trang dự án: không phóng to/thu nhỏ để ảnh/video luôn cùng kích thước
  if (!document.body.classList.contains('project')) document.querySelectorAll(scaleSel).forEach((el) => {
    const it = find(el);
    if (it) it.scale = true; else items.push({ el, kind: 'scale', cur: 1, scale: true });
  });
  items.forEach((it) => { it.s = 0.9; it.el.classList.add('fx'); });

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
      let target = 1;
      if (it.kind === 'words') target = clamp((vh * 0.92 - r.top) / (vh * 0.4 + r.height * 0.6));
      else if (it.kind === 'block') target = clamp((vh * 1.0 - r.top - (it.delay || 0) * vh * 0.06) / (vh * 0.26));
      if (atEnd) target = 1;
      if (it.cur < 0) it.cur = target;
      const next = it.cur + (target - it.cur) * 0.14;
      it.cur = Math.abs(target - next) < 0.002 ? target : next;
      if (it.cur !== target) moving = true;
      let sTarget = 1;
      if (it.scale) {
        // khoảng cách từ tâm phần tử tới tâm màn hình: ở giữa = to nhất, lệch lên/xuống = thu nhỏ
        const d = Math.min(1, Math.abs(r.top + r.height / 2 - vh / 2) / (vh / 2 + Math.min(r.height, vh) / 2));
        sTarget = 0.88 + 0.12 * (1 - d * d);
        const ns = it.s + (sTarget - it.s) * 0.14;
        it.s = Math.abs(sTarget - ns) < 0.0005 ? sTarget : ns;
        if (it.s !== sTarget) moving = true;
      }
      if (r.bottom < -300 || r.top > vh + 300) return;
      if (it.kind === 'words') {
        const n = it.words.length, pos = it.cur * (n + 3);
        it.words.forEach((w, k) => { const o = 0.16 + 0.84 * clamp(pos - k); w.style.opacity = o >= 1 ? '' : o.toFixed(3); });
        return;
      }
      let e = ease(it.cur); if (e > 0.998) e = 1;
      const y = it.kind === 'block' && e < 1 ? (1 - e) * 70 : 0;
      const sc = it.scale && Math.abs(it.s - 1) > 0.0005 ? it.s : 1;
      it.el.style.opacity = e >= 1 ? '' : e.toFixed(3);
      it.el.style.transform = (y || sc !== 1) ? `translate3d(0, ${y.toFixed(1)}px, 0) scale(${sc.toFixed(4)})` : '';
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

// Tiêu đề trang chủ: mỗi dòng tự co giãn cho bằng đúng bề ngang khối chữ (2 dòng đều nhau như 1 khung)
(() => {
  const h = document.querySelector('.hero h1.fit');
  if (!h) return;
  const fit = () => {
    const lines = [...h.querySelectorAll('.ln')];
    const W = h.parentElement.clientWidth;
    lines.forEach((l) => { l.style.fontSize = ''; const w = l.getBoundingClientRect().width; const fs = parseFloat(getComputedStyle(l).fontSize); if (w > 0) l.style.fontSize = (fs * W / w * 0.995).toFixed(2) + 'px'; });
  };
  fit(); addEventListener('resize', fit); addEventListener('load', fit);
  if (document.fonts) document.fonts.ready.then(fit);
})();
