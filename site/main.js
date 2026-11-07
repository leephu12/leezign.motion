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
  const blockSel = '.content > *:not(.gallery):not(.cta):not(.ab-contact):not(.globe-scene):not(.tag-row):not(.ab-hero), .ab-hero > *, .ab-hero-row > *, .specs > .spec, .gallery > h2, .grid .card, .ab-wide, .ab-row, .cover';
  const scaleSel = '.cover, .ab-wide, .content > figure.media, .callout-video, .grid .row';
  const find = (el) => items.find((x) => x.el === el);
  document.querySelectorAll(blockSel).forEach((el) => {
    if (find(el)) return;
    if (el.parentElement.closest('.ab-row') && !el.matches('.grid .card')) return;
    if (el.matches('.ab-hero-row, .specs')) return; // chỉ cho các phần con hiện lần lượt
    const row = el.matches('.grid .card') ? el.parentElement : null;
    items.push({ el, kind: 'block', cur: -1, delay: row ? [...row.children].indexOf(el) : 0 });
  });
  // trang dự án: không phóng to/thu nhỏ để ảnh/video luôn cùng kích thước
  if (!document.body.classList.contains('project')) document.querySelectorAll(scaleSel).forEach((el) => {
    const it = find(el);
    if (it) it.scale = true; else items.push({ el, kind: 'scale', cur: 1, scale: true });
  });
  items.forEach((it) => { it.s = 0.9; it.el.classList.add('fx'); });
  // xếp theo thứ tự trên trang → phần sau chỉ bắt đầu hiện khi phần trước đã hiện được một nửa (hiện lần lượt, không đồng loạt)
  items.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  const clamp = (v) => Math.max(0, Math.min(1, v));
  // trang About: hiện chậm rãi, nhẹ nhàng hơn (lerp nhỏ, quãng trượt ngắn, đường cong mềm)
  const gentle = document.body.classList.contains('page-about-me') || !!document.querySelector('.ab-hero');
  const LERP = gentle ? 0.06 : 0.1;
  const ease = gentle ? (t) => t * t * (3 - 2 * t) : (t) => 1 - Math.pow(1 - t, 3);
  let raf = 0;
  const frame = () => {
    raf = 0;
    const vh = innerHeight;
    const atEnd = innerHeight + scrollY >= root.scrollHeight - 4;
    const rects = items.map((it) => it.el.getBoundingClientRect()); // đọc trước, ghi sau (tránh giật)
    let moving = false, prevChain = null;
    items.forEach((it, i) => {
      const r = rects[i];
      let target = 1;
      if (it.kind === 'words') target = clamp((vh * 0.92 - r.top) / (vh * 0.4 + r.height * 0.6));
      else if (it.kind === 'block') target = clamp((vh * 1.0 - r.top - (it.delay || 0) * vh * 0.06) / (vh * (gentle ? 0.42 : 0.3)));
      if (atEnd) target = 1;
      if (it.kind !== 'scale') {
        if (prevChain && prevChain.cur < 0.999 && prevChain.bottom > 0) target = Math.min(target, Math.max(0, prevChain.cur - 0.35) / 0.65);
        prevChain = it; it.bottom = r.bottom;
      }
      if (it.cur < 0) it.cur = it.kind === 'words' || r.bottom < 0 ? target : 0;
      const next = it.cur + (target - it.cur) * LERP;
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
      const y = it.kind === 'block' && e < 1 ? (1 - e) * (gentle ? 36 : 56) : 0;
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

// Tiêu đề trang chủ: ký tự ngẫu nhiên đổi liên tục rồi "giải mã" thành chữ thật (lần lượt từng chữ cái)
(() => {
  const chs = [...document.querySelectorAll('.home .hero h1.fit .ch')];
  if (!chs.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const G = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#/<>{}*+=%&?';
  const t0 = performance.now();
  chs.forEach((c) => { if (c.textContent.trim()) c.dataset.s = G[(Math.random() * G.length) | 0]; });
  let last = 0;
  const tick = (now) => {
    let live = 0;
    const flip = now - last > 55; if (flip) last = now;
    chs.forEach((c, i) => {
      if (!('s' in c.dataset)) return;
      const end = 200 + i * 26 + 520; // chữ cái đổi ký tự trong lúc nhảy lên, rồi dừng đúng chữ
      if (now - t0 > end) { delete c.dataset.s; return; }
      live++;
      if (flip) c.dataset.s = G[(Math.random() * G.length) | 0];
    });
    if (live) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

// Giới thiệu trang chủ: tách chữ để hiện lần lượt từng từ (kèm ô video, chữ "and", biểu tượng)
(() => {
  const tg = document.querySelector('.home .hero .tagline');
  if (!tg) return;
  let i = 0;
  const wrap = (node) => {
    [...node.childNodes].forEach((c) => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.nodeValue.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span'); w.className = 'tw'; w.style.setProperty('--i', i++); w.textContent = part; frag.appendChild(w);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1) { c.classList.add('tw'); c.style.setProperty('--i', i++); }
    });
  };
  wrap(tg);
  document.documentElement.classList.add('tg-ready');
  // chia theo dòng hiển thị: mỗi dòng hiện sau dòng trước, từ trong dòng hiện lần lượt
  const lineUp = () => {
    if (document.documentElement.classList.contains('tg-lined')) return;
    const ws = [...tg.querySelectorAll('.tw')];
    let line = -1, top = -1e9, k = 0;
    ws.forEach((w) => {
      const t = w.getBoundingClientRect().top + w.offsetHeight / 2;
      if (t - top > w.offsetHeight * 0.6) { line++; top = t; k = 0; }
      w.style.setProperty('--l', line); w.style.setProperty('--k', k++);
    });
    document.documentElement.classList.add('tg-lined');
  };
  (document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]) : Promise.resolve()).then(() => requestAnimationFrame(lineUp));
})();

// Đổi giao diện màu: V1 Red · V2 Dark · V3 Neo (nút ở cạnh phải trình duyệt, nhớ lựa chọn)
(() => {
  const box = document.querySelector('.theme-switch');
  if (!box) return;
  const root = document.documentElement;
  const cur = () => root.dataset.theme || 'red';
  const mark = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === cur()));
  mark();
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (matchMedia('(max-width: 760px)').matches && !box.classList.contains('open')) { box.classList.add('open'); return; }
    const t = b.dataset.t;
    if (t === 'red') delete root.dataset.theme; else root.dataset.theme = t;
    try { t === 'red' ? localStorage.removeItem('lz-theme') : localStorage.setItem('lz-theme', t); } catch (err) {}
    mark(); box.classList.remove('open');
    dispatchEvent(new Event('resize')); // vẽ lại quả địa cầu với màu mới
  });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) box.classList.remove('open'); });
})();

// Hàng nút danh mục: thêm lớp .stuck khi đang được ghim dưới thanh menu (để hoà trộn overlay)
(() => {
  const rows = [...document.querySelectorAll('.tag-row')];
  if (!rows.length) return;
  let raf = 0;
  const check = () => {
    raf = 0;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 61;
    rows.forEach((r) => r.classList.toggle('stuck', scrollY > 0 && r.getBoundingClientRect().top <= top + 1));
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(check); }, { passive: true });
  addEventListener('resize', check); check();
})();
