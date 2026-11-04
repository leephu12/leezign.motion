// Đồng bộ trang Notion → website tĩnh cho GitHub Pages.
// Chạy: NOTION_TOKEN=... NOTION_PAGE_ID=... node scripts/build.mjs
import notionPkg from '@notionhq/client';
const { Client } = notionPkg;
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT = path.resolve('dist');
const CACHE = path.resolve('.cache/media');
const STYLE_SRC = path.resolve('site/style.css');
const SCRIPT_SRC = path.resolve('site/main.js');

const rawRoot = process.env.NOTION_PAGE_ID || '';
const ROOT_ID = parseId(rawRoot);
if (!ROOT_ID) fail('Thiếu NOTION_PAGE_ID → Settings → Secrets and variables → Actions → thêm NOTION_PAGE_ID = link trang chính Notion.');

let notion;
if (process.env.NOTION_MOCK) {
  notion = (await import(path.resolve(process.env.NOTION_MOCK))).default;
} else {
  if (!process.env.NOTION_TOKEN) fail('Thiếu NOTION_TOKEN → Settings → Secrets and variables → Actions → New repository secret, tên NOTION_TOKEN.');
  notion = new Client({ auth: process.env.NOTION_TOKEN });
}

// ---------- tiện ích ----------
function fail(msg) { console.error('✖ ' + msg); process.exit(1); }
function parseId(s) {
  const clean = String(s).trim().split(/[?#]/)[0].replace(/-/g, '');
  const m = clean.match(/[0-9a-f]{32}$/i) || clean.match(/[0-9a-f]{32}/i);
  return m ? m[0].toLowerCase() : null;
}
const normId = (id) => (id || '').replace(/-/g, '').toLowerCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'page';
}
async function paginate(fn, args) {
  const out = []; let cursor;
  do {
    const res = await fn({ ...args, start_cursor: cursor, page_size: 100 });
    out.push(...res.results); cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}
const plain = (arr) => (arr || []).map((t) => t.plain_text).join('');
const pageTitle = (page) => {
  for (const p of Object.values(page.properties || {})) if (p.type === 'title') return plain(p.title);
  return 'Untitled';
};

// ---------- media: tải file Notion về (link Notion hết hạn sau ~1 giờ) ----------
const usedMedia = new Set();
async function media(url) {
  if (!url) return '';
  let u; try { u = new URL(url); } catch { return url; }
  const notionHosted = /amazonaws\.com|notion-static\.com|notion\.so|notionusercontent\.com|file\.notion\.so/.test(u.hostname);
  if (!notionHosted) return url;
  const ext = (path.extname(decodeURIComponent(u.pathname)) || '').toLowerCase().slice(0, 6);
  const name = crypto.createHash('sha1').update(u.pathname).digest('hex').slice(0, 16) + ext;
  const file = path.join(CACHE, name);
  if (!fss.existsSync(file)) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
        console.log('  ↓ ' + name);
        break;
      } catch (e) {
        if (i === 2) { console.warn('  ! không tải được media: ' + e.message); return ''; }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  usedMedia.add(name);
  return '@@ROOT@@media/' + name;
}
const fileUrl = (f) => !f ? '' : f.type === 'external' ? f.external?.url : f.file?.url;

// ---------- thu thập nội dung ----------
const pages = new Map(); // id → node
const slugs = new Set(['index', 'media']);
const siteNav = [];      // các trang trong thanh menu (lấy từ synced block ở trang chủ)
let siteFooter = '';
let siteBrand = '';      // chữ cạnh logo (lấy từ link đầu tiên trong thanh menu Notion)     // dòng © lấy từ footer trong Notion
const dsSchemas = new Map();
const lists = [];        // mọi gallery đã đọc, dùng để tính Previous/Next

async function getBlocks(id) {
  const blocks = await paginate((a) => notion.blocks.children.list(a), { block_id: id });
  for (const b of blocks) {
    if (b.type === 'synced_block' && b.synced_block?.synced_from?.block_id) {
      b.children = await getBlocks(b.synced_block.synced_from.block_id); // bản sao → đọc khối gốc
    } else if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database') {
      b.children = await getBlocks(b.id);
    }
  }
  return blocks;
}

const deep = (blocks, fn) => (blocks || []).some((b) => fn(b) || deep(b.children, fn));
const textOf = (b) => plain(b?.[b?.type]?.rich_text).trim();
const isBlank = (b) => (b.type === 'paragraph' && !textOf(b)) || b.type === 'unsupported' || b.type === 'breadcrumb';
const NAV_RE = /^(←|tiếp\s*→|next\s*→|previous|trước)/i;
const isNavLine = (b) => NAV_RE.test(textOf(b)) || /(←\s*(previous|trước))|((next|tiếp)\s*→)/i.test(textOf(b));
const eqText = (expr) => {
  const m = String(expr).match(/\\text\{([^}]*)\}/);
  return (m ? m[1] : String(expr).replace(/\\[a-z]+(\{[^}]*\})?/gi, ' ')).replace(/\s+/g, ' ').trim();
};

// Thanh menu (synced block chứa Work / About me / Contact): website tự dựng thanh menu riêng.
function takeNav(blocks) {
  const out = [];
  let nav = null;
  for (const b of blocks) {
    if (!nav && b.type === 'synced_block' && deep(b.children, (c) => c.type === 'child_page')) nav = b;
    else out.push(b);
  }
  return { blocks: out, nav };
}
// Dòng "← All work" / "← All making of" ở đầu trang: đã có trên thanh menu website.
function stripNotionHeader(blocks) {
  const i = blocks.findIndex((b) => !isBlank(b));
  const b = blocks[i];
  if (b?.type === 'paragraph' && /^←/.test(textOf(b)) && textOf(b).length < 40) return blocks.slice(i + 1);
  return blocks;
}
// Footer viết tay trong Notion (đường kẻ, ← Previous / Next →, dòng ©): website tự tạo lại.
function stripNotionFooter(blocks) {
  let i = blocks.length, found = false;
  while (i > 0) {
    const b = blocks[i - 1];
    if (isBlank(b) || b.type === 'divider') { i--; continue; }
    if (b.type === 'equation' && /©/.test(b.equation.expression)) { siteFooter ||= eqText(b.equation.expression); found = true; i--; continue; }
    if (b.type === 'paragraph' && /^©/.test(textOf(b))) { siteFooter ||= textOf(b); found = true; i--; continue; }
    if (b.type === 'column_list' && deep(b.children, (c) => c[c.type]?.rich_text && isNavLine(c))) { found = true; i--; continue; }
    if (b.type === 'paragraph' && /^←/.test(textOf(b)) && textOf(b).length < 40) { i--; continue; } // "← All work" ở cuối trang
    break;
  }
  return found ? blocks.slice(0, i) : blocks;
}

const SORT_NAMES = ['order', 'thứ tự', 'thu tu', 'sort', 'stt', '#'];
const SHOW_NAMES = ['published', 'public', 'hiển thị', 'hien thi', 'show'];
const HIDE_NAMES = ['hidden', 'ẩn', 'an', 'draft', 'nháp'];

async function crawlPage(id, parent = null) {
  id = normId(id);
  if (pages.has(id)) return pages.get(id);
  const page = await notion.pages.retrieve({ page_id: id });
  const title = pageTitle(page);
  let slug = id === ROOT_ID ? 'index' : slugify(title);
  if (id !== ROOT_ID) { let s = slug, i = 2; while (slugs.has(s)) s = `${slug}-${i++}`; slug = s; slugs.add(slug); }
  const node = { id, page, title, slug, parent, blocks: [], databases: {} };
  pages.set(id, node);
  console.log('• ' + title);
  const { blocks, nav } = takeNav(await getBlocks(id));
  if (nav && !siteNav.length) {
    const walk = (bs) => bs.forEach((b) => {
      if (b.type === 'child_page') siteNav.push(normId(b.id));
      else if (!siteBrand && b.type === 'paragraph' && textOf(b)) siteBrand = textOf(b);
      walk(b.children || []);
    });
    walk(nav.children || []);
  }
  node.blocks = stripNotionFooter(stripNotionHeader(blocks));
  await crawlChildren(node.blocks, node);
  if (nav) await crawlChildren(nav.children || [], node);
  return node;
}

async function crawlChildren(blocks, node) {
  for (const b of blocks) {
    if (b.type === 'child_page') await crawlPage(b.id, node);
    else if (b.type === 'child_database') node.databases[normId(b.id)] = await crawlDatabase(b, node);
    if (b.children) await crawlChildren(b.children, node);
  }
}

async function schemaOf(dsId) {
  if (!dsSchemas.has(dsId)) {
    let props = {};
    try { props = (await notion.dataSources.retrieve({ data_source_id: dsId })).properties || {}; } catch {}
    dsSchemas.set(dsId, props);
  }
  return dsSchemas.get(dsId);
}

// Đọc gallery theo đúng view trong Notion (bộ lọc, thứ tự, nhóm) — kể cả linked view.
async function viaView(dbId) {
  if (!notion.views?.list) return null;
  const list = await notion.views.list({ database_id: dbId });
  const ref = list.results?.[0];
  if (!ref) return null;
  const view = await notion.views.retrieve({ view_id: ref.id });
  let q = await notion.views.queries.create({ view_id: ref.id, page_size: 100 });
  const ids = q.results.map((r) => r.id);
  while (q.has_more && q.next_cursor) {
    q = await notion.views.queries.results({ view_id: ref.id, query_id: q.id, start_cursor: q.next_cursor, page_size: 100 });
    ids.push(...q.results.map((r) => r.id));
  }
  return { view, ids, dsId: view.data_source_id };
}

async function viaQuery(dbId) {
  const db = await notion.databases.retrieve({ database_id: dbId });
  const rows = [];
  let dsId;
  for (const ds of db.data_sources || [{ id: dbId }]) {
    dsId ||= ds.id;
    rows.push(...await paginate((a) => notion.dataSources.query(a), { data_source_id: ds.id }));
  }
  const schema = dsId ? await schemaOf(dsId) : {};
  const find = (names, types) => Object.entries(rows[0]?.properties || schema)
    .find(([k, v]) => names.includes(k.trim().toLowerCase()) && types.includes(v.type))?.[0];
  const sortKey = find(SORT_NAMES, ['number']);
  const showKey = find(SHOW_NAMES, ['checkbox']);
  const hideKey = find(HIDE_NAMES, ['checkbox']);
  const dateKey = Object.entries(rows[0]?.properties || {}).find(([, v]) => v.type === 'date')?.[0];
  let visible = rows.filter((r) => !r.in_trash && !r.archived
    && (!showKey || r.properties[showKey]?.checkbox) && (!hideKey || !r.properties[hideKey]?.checkbox));
  if (sortKey) visible.sort((a, b) => (a.properties[sortKey].number ?? 1e9) - (b.properties[sortKey].number ?? 1e9));
  else if (dateKey) visible.sort((a, b) => String(b.properties[dateKey].date?.start || '').localeCompare(String(a.properties[dateKey].date?.start || '')));
  else visible.sort((a, b) => b.created_time.localeCompare(a.created_time));
  return { ids: visible.map((r) => r.id), dsId, hidden: [sortKey, showKey, hideKey].filter(Boolean), title: plain(db.title) };
}

async function crawlDatabase(block, parent) {
  const dbId = block.id;
  let res;
  try { res = await viaView(dbId); } catch (e) { console.warn('  ! views API: ' + e.message); }
  if (!res) {
    try { res = await viaQuery(dbId); }
    catch (e) { console.warn('  ! bỏ qua database: ' + e.message); return null; }
  }
  const items = [];
  for (const pid of res.ids) {
    const n = await crawlPage(pid, parent);
    if (!n.page.in_trash && !n.page.archived && n.title.trim()) items.push(n); // bỏ trang trống chưa đặt tên
  }
  const title = block.child_database?.title || res.title || '';
  const group = { id: normId(dbId), title: /^(view of |untitled$)/i.test(title.trim()) ? '' : title, items, dsId: res.dsId, hiddenProps: new Set(res.hidden || []) };

  // Gallery nhóm theo thuộc tính (VD: Work nhóm theo TAGS)
  const gb = res.view?.configuration?.group_by;
  if (gb && ['select', 'multi_select'].includes(gb.type) && res.dsId) {
    const schema = await schemaOf(res.dsId);
    const [name, prop] = Object.entries(schema).find(([k, v]) => v.id === gb.property_id || k === gb.property_name) || [];
    if (name) {
      const options = prop[prop.type]?.options || [];
      const valueOf = (n) => { const p = n.page.properties[name]; return p?.type === 'select' ? [p.select?.name].filter(Boolean) : (p?.multi_select || []).map((o) => o.name); };
      group.groups = options.map((o) => ({ name: o.name, items: items.filter((n) => valueOf(n).includes(o.name)) }))
        .filter((g) => g.items.length);
    }
  }
  lists.push(group);
  return group;
}

// Previous / Next: theo danh sách đầy đủ nhất của mỗi database (thường là trang Work)
function assignPagers() {
  const best = new Map();
  for (const g of lists) {
    const seq = [...new Set((g.groups ? g.groups.flatMap((x) => x.items) : g.items))];
    const key = g.dsId || g.id;
    if (!best.has(key) || seq.length > best.get(key).length) best.set(key, seq);
  }
  for (const seq of best.values()) seq.forEach((n, i) => { n.pager = { prev: seq[i - 1], next: seq[i + 1] }; });
  for (const g of lists) for (const n of g.items) n.group ||= g;
}

// ---------- render ----------
const COLORS = new Set(['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']);
const colorCls = (c) => {
  if (!c || c === 'default') return '';
  const [name, bg] = c.split('_');
  return COLORS.has(name) ? (bg ? ` bg-${name}` : ` c-${name}`) : '';
};
function linkFor(target, ctx) {
  const n = pages.get(normId(target));
  if (!n) return null;
  return n.slug === 'index' ? ctx.root + 'index.html' : `${ctx.root}p/${n.slug}/`;
}
function mapHref(href, ctx) {
  if (!href) return href;
  if (href.startsWith('/')) { const id = parseId(href); return (id && linkFor(id, ctx)) || 'https://www.notion.so' + href; }
  if (/notion\.(so|site|com)/.test(href)) { const id = parseId(href.split('?')[0].split('#')[0]); return (id && linkFor(id, ctx)) || href; }
  return href;
}
function rt(arr, ctx) {
  return (arr || []).map((t) => {
    let s;
    if (t.type === 'equation') s = `<code class="eq">${esc(t.equation.expression)}</code>`;
    else if (t.type === 'mention' && t.mention?.type === 'page') {
      const l = linkFor(t.mention.page.id, ctx);
      s = l ? `<a href="${l}">${esc(t.plain_text)}</a>` : esc(t.plain_text);
    } else s = esc(t.plain_text).replace(/\n/g, '<br>');
    const a = t.annotations || {};
    if (a.code) s = `<code>${s}</code>`;
    if (a.bold) s = `<strong>${s}</strong>`;
    if (a.italic) s = `<em>${s}</em>`;
    if (a.strikethrough) s = `<s>${s}</s>`;
    if (a.underline) s = `<u>${s}</u>`;
    const cc = colorCls(a.color);
    if (cc) s = `<span class="${cc.trim()}">${s}</span>`;
    if (t.href && t.type !== 'mention') {
      const h = mapHref(t.href, ctx);
      const ext = /^https?:/.test(h);
      s = `<a href="${esc(h)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${s}</a>`;
    }
    return s;
  }).join('');
}
const caption = (b, ctx) => { const c = rt(b[b.type]?.caption, ctx); return c ? `<figcaption>${c}</figcaption>` : ''; };

function videoEmbed(url) {
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)))
    return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0`;
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/(\w+))?/)))
    return `https://player.vimeo.com/video/${m[1]}${m[2] ? '?h=' + m[2] : ''}`;
  if ((m = url.match(/loom\.com\/share\/(\w+)/))) return `https://www.loom.com/embed/${m[1]}`;
  return null;
}
const isVideoFile = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u);
const isImageFile = (u) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u);
const videoTag = (src, cls = '') =>
  `<video class="${cls}" src="${esc(src)}" muted loop playsinline autoplay preload="metadata" controls></video>`;

async function renderBlocks(blocks, ctx) {
  let html = '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item' || b.type === 'to_do') {
      const type = b.type; const tag = type === 'numbered_list_item' ? 'ol' : 'ul';
      let items = '';
      while (i < blocks.length && blocks[i].type === type) {
        const it = blocks[i]; const d = it[type];
        const box = type === 'to_do' ? `<input type="checkbox" disabled${d.checked ? ' checked' : ''}> ` : '';
        items += `<li class="${colorCls(d.color).trim()}">${box}${rt(d.rich_text, ctx)}${it.children ? await renderBlocks(it.children, ctx) : ''}</li>`;
        i++;
      }
      i--;
      html += `<${tag}${type === 'to_do' ? ' class="todo"' : ''}>${items}</${tag}>`;
      continue;
    }
    html += await renderBlock(b, ctx);
  }
  return html;
}

async function renderBlock(b, ctx) {
  const d = b[b.type] || {};
  const kids = async () => (b.children ? await renderBlocks(b.children, ctx) : '');
  switch (b.type) {
    case 'paragraph': {
      const t = rt(d.rich_text, ctx);
      // Đoạn chỉ gồm một link kết thúc bằng "→" (VD: "View all Branding →") hiển thị như nút bấm
      const r = d.rich_text || [];
      if (r.length && r.every((x) => x.href || !x.plain_text.trim()) && /→\s*$/.test(plain(r))) {
        const href = mapHref(r.find((x) => x.href).href, ctx);
        return `<p class="more"><a class="btn" href="${esc(href)}">${esc(plain(r).trim())}</a></p>`;
      }
      return (t ? `<p class="${colorCls(d.color).trim()}">${t}</p>` : '<div class="spacer"></div>') + await kids();
    }
    case 'heading_1': case 'heading_2': case 'heading_3': {
      const lvl = Number(b.type.slice(-1)) + 1; // h1 dành cho tiêu đề trang
      const h = `<h${lvl} class="${colorCls(d.color).trim()}">${rt(d.rich_text, ctx)}</h${lvl}>`;
      return d.is_toggleable ? `<details><summary>${h}</summary>${await kids()}</details>` : h;
    }
    case 'quote': return `<blockquote class="${colorCls(d.color).trim()}">${rt(d.rich_text, ctx)}${await kids()}</blockquote>`;
    case 'callout': {
      const iconUrl = d.icon && d.icon.type !== 'emoji' ? fileUrl(d.icon) : '';
      const icon = d.icon?.type === 'emoji' ? `<span class="callout-icon">${d.icon.emoji}</span>`
        : iconUrl ? `<img class="callout-icon" src="${esc(iconUrl)}" alt="" onerror="this.remove()">` : '';
      return `<div class="callout${colorCls(d.color)}">${icon}<div>${rt(d.rich_text, ctx)}${await kids()}</div></div>`;
    }
    case 'toggle': return `<details><summary>${rt(d.rich_text, ctx)}</summary>${await kids()}</details>`;
    case 'divider': return '<hr>';
    case 'code': return `<pre><code class="lang-${esc(d.language)}">${esc(plain(d.rich_text))}</code></pre>${caption(b, ctx)}`;
    case 'equation': return /\\text\{/.test(d.expression) ? `<p class="eq-text">${esc(eqText(d.expression))}</p>` : `<p class="eq-block"><code>${esc(d.expression)}</code></p>`;
    case 'image': {
      const src = await media(fileUrl(d));
      return src ? `<figure class="media"><img src="${esc(src)}" alt="${esc(plain(d.caption))}" loading="lazy">${caption(b, ctx)}</figure>` : '';
    }
    case 'video': {
      const raw = fileUrl(d); if (!raw) return '';
      const emb = d.type === 'external' && videoEmbed(raw);
      if (emb) return `<figure class="media"><div class="ratio"><iframe src="${esc(emb)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>${caption(b, ctx)}</figure>`;
      return `<figure class="media">${videoTag(await media(raw))}${caption(b, ctx)}</figure>`;
    }
    case 'audio': return `<figure><audio controls src="${esc(await media(fileUrl(d)))}"></audio>${caption(b, ctx)}</figure>`;
    case 'file': case 'pdf': {
      const raw = fileUrl(d); if (!raw) return '';
      const src = await media(raw);
      const name = d.name || plain(d.caption) || decodeURIComponent(path.basename(new URL(raw).pathname));
      if (b.type === 'pdf') return `<figure class="media"><div class="ratio pdf"><iframe src="${esc(src)}" loading="lazy"></iframe></div>${caption(b, ctx)}</figure>`;
      return `<p><a class="file" href="${esc(src)}" download>📎 ${esc(name)}</a></p>`;
    }
    case 'embed': case 'link_preview': {
      const url = d.url; if (!url) return '';
      const emb = videoEmbed(url);
      if (emb) return `<figure class="media"><div class="ratio"><iframe src="${esc(emb)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>${caption(b, ctx)}</figure>`;
      if (isImageFile(url)) return `<figure class="media"><img src="${esc(url)}" loading="lazy" alt="">${caption(b, ctx)}</figure>`;
      if (isVideoFile(url)) return `<figure class="media">${videoTag(url)}${caption(b, ctx)}</figure>`;
      return `<figure class="media"><div class="ratio"><iframe src="${esc(url)}" loading="lazy" allowfullscreen></iframe></div>${caption(b, ctx)}</figure>`;
    }
    case 'bookmark': {
      const url = d.url; if (!url) return '';
      const emb = videoEmbed(url);
      if (emb) return `<figure class="media"><div class="ratio"><iframe src="${esc(emb)}" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe></div></figure>`;
      const label = plain(d.caption) || url.replace(/^https?:\/\//, '');
      return `<a class="bookmark" href="${esc(url)}" target="_blank" rel="noopener"><span>${esc(label)}</span><span class="arrow">↗</span></a>`;
    }
    case 'column_list': {
      const cols = b.children || [];
      // Hàng nút danh mục: mỗi cột chỉ có 1 trang con hoặc 1 callout chứa link → hiển thị thành nút tag
      const pills = cols.map((c) => {
        const inner = (c.children || []).filter((x) => !isBlank(x));
        if (inner.length !== 1) return null;
        const x = inner[0];
        if (x.type === 'child_page') { const l = linkFor(x.id, ctx); return l && { href: l, label: x.child_page.title }; }
        if (x.type === 'callout') {
          const r = (x.callout.rich_text || []).filter((t) => t.plain_text.trim());
          if (r.length !== 1) return null;
          const t = r[0];
          const href = t.type === 'mention' && t.mention?.type === 'page' ? linkFor(t.mention.page.id, ctx) : t.href && mapHref(t.href, ctx);
          return href && { href, label: t.plain_text.trim(), icon: x.callout.icon?.type === 'emoji' ? x.callout.icon.emoji : '' };
        }
        return null;
      });
      if (cols.length > 1 && pills.every(Boolean))
        return `<nav class="tag-row">${pills.map((p) => `<a href="${esc(p.href)}">${p.icon ? `<span>${p.icon}</span>` : ''}${esc(p.label)}</a>`).join('')}</nav>`;
      const ratios = cols.map((c) => c.column?.width_ratio || 1);
      let inner = '';
      for (const c of cols) inner += `<div class="col">${c.children ? await renderBlocks(c.children, ctx) : ''}</div>`;
      return `<div class="cols" style="--n:${cols.length};--tpl:${ratios.map((r) => `minmax(0,${r}fr)`).join(' ')}">${inner}</div>`;
    }
    case 'column': return await kids();
    case 'synced_block': return await kids();
    case 'table': {
      const rows = b.children || [];
      const body = rows.map((r, ri) => {
        const cells = r.table_row?.cells || [];
        return '<tr>' + cells.map((c, ci) => {
          const th = (d.has_column_header && ri === 0) || (d.has_row_header && ci === 0);
          return `<${th ? 'th' : 'td'}>${rt(c, ctx)}</${th ? 'th' : 'td'}>`;
        }).join('') + '</tr>';
      }).join('');
      return `<div class="table-wrap"><table>${body}</table></div>`;
    }
    case 'child_page': {
      const n = pages.get(normId(b.id));
      return n ? `<div class="grid">${await card(n, ctx)}</div>` : '';
    }
    case 'link_to_page': {
      const target = d.page_id || d.database_id; const l = target && linkFor(target, ctx);
      const n = target && pages.get(normId(target));
      return l ? `<p><a class="page-link" href="${l}">→ ${esc(n.title)}</a></p>` : '';
    }
    case 'child_database': {
      const g = ctx.node.databases[normId(b.id)];
      if (!g || !g.items.length) return '';
      const grid = async (items) => { let c = ''; for (const n of items) c += await card(n, ctx); return `<div class="grid">${c}</div>`; };
      if (g.groups) {
        let out = '';
        for (const gr of g.groups) out += `<section class="gallery group"><h2 class="group-title">${esc(gr.name)}</h2>${await grid(gr.items)}</section>`;
        return out;
      }
      return `<section class="gallery">${g.title ? `<h2 class="gallery-title">${esc(g.title)}</h2>` : ''}${await grid(g.items)}</section>`;
    }
    default: return '';
  }
}

// Ảnh/video đại diện: cover → thuộc tính Files → media đầu tiên trong trang
function findFirstMedia(blocks) {
  for (const b of blocks || []) {
    if (b.type === 'image' || b.type === 'video') return { kind: b.type, url: fileUrl(b[b.type]), external: b[b.type].type === 'external' };
    if (b.type === 'embed' && b.embed.url && (isImageFile(b.embed.url) || isVideoFile(b.embed.url)))
      return { kind: isVideoFile(b.embed.url) ? 'video' : 'image', url: b.embed.url, external: true };
    const inner = findFirstMedia(b.children); if (inner) return inner;
  }
  return null;
}
function thumbSource(n) {
  if (n.page.cover) return { kind: 'image', url: fileUrl(n.page.cover) };
  for (const p of Object.values(n.page.properties || {})) {
    if (p.type === 'files' && p.files?.length) {
      const f = p.files[0]; const url = fileUrl(f);
      return { kind: isVideoFile(f.name || url) ? 'video' : 'image', url };
    }
  }
  return findFirstMedia(n.blocks);
}
async function thumbHtml(n) {
  const t = thumbSource(n);
  if (!t?.url) return `<div class="thumb empty"><span>${esc(n.title.slice(0, 1))}</span></div>`;
  if (t.kind === 'video') {
    const emb = videoEmbed(t.url);
    if (emb) return `<div class="thumb empty"><span>▶</span></div>`;
    return `<div class="thumb"><video src="${esc(await media(t.url))}" muted loop playsinline autoplay preload="metadata"></video></div>`;
  }
  return `<div class="thumb"><img src="${esc(await media(t.url))}" alt="" loading="lazy"></div>`;
}
function tags(n) {
  const out = [];
  for (const [k, p] of Object.entries(n.page.properties || {})) {
    if (n.group?.hiddenProps.has(k)) continue;
    if (p.type === 'select' && p.select) out.push(p.select.name);
    if (p.type === 'status' && p.status) continue;
    if (p.type === 'multi_select') out.push(...p.multi_select.map((s) => s.name));
  }
  return out.slice(0, 4);
}
async function card(n, ctx) {
  const t = tags(n);
  return `<a class="card" href="${linkFor(n.id, ctx)}">${await thumbHtml(n)}<div class="card-body"><h3>${esc(n.title)}</h3>${t.length ? `<p class="tags">${t.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}</div></a>`;
}

function propValue(p, ctx) {
  switch (p.type) {
    case 'rich_text': return rt(p.rich_text, ctx);
    case 'select': return p.select ? `<span class="chip">${esc(p.select.name)}</span>` : '';
    case 'status': return '';
    case 'multi_select': return p.multi_select.map((s) => `<span class="chip">${esc(s.name)}</span>`).join('');
    case 'date': {
      if (!p.date?.start) return '';
      if (ctx.key && /year|năm/i.test(ctx.key)) return esc(p.date.start.slice(0, 4) + (p.date.end ? ' – ' + p.date.end.slice(0, 4) : ''));
      const f = (s) => new Date(s).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', ...(s.length > 7 ? { day: '2-digit' } : {}) });
      return esc(f(p.date.start) + (p.date.end ? ' – ' + f(p.date.end) : ''));
    }
    case 'number': return p.number == null ? '' : esc(p.number);
    case 'url': return p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : '';
    case 'email': return p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '';
    case 'phone_number': return esc(p.phone_number || '');
    case 'people': return esc((p.people || []).map((x) => x.name).filter(Boolean).join(', '));
    case 'relation': return (p.relation || []).map((r) => { const l = linkFor(r.id, ctx); const n = pages.get(normId(r.id)); return l ? `<a href="${l}">${esc(n.title)}</a>` : ''; }).filter(Boolean).join(', ');
    case 'formula': { const f = p.formula; return esc(f?.[f?.type] ?? ''); }
    default: return '';
  }
}

function excerpt(blocks) {
  for (const b of blocks || []) if (b.type === 'paragraph') { const t = plain(b.paragraph.rich_text); if (t) return t.slice(0, 160); }
  return '';
}

async function renderPage(n, rootNode) {
  const depth = n.slug === 'index' ? 0 : 2;
  const ctx = { root: depth ? '../../' : '', node: n };
  let blocks = n.blocks;
  let tagline = '';
  const firstIdx = blocks.findIndex((b) => !isBlank(b));
  if (n.slug === 'index' && /^heading_/.test(blocks[firstIdx]?.type || '')) {
    tagline = `<h3 class="tagline">${rt(blocks[firstIdx][blocks[firstIdx].type].rich_text, ctx)}</h3>`;
    blocks = blocks.filter((_, i) => i !== firstIdx);
  }
  let content = await renderBlocks(blocks, ctx);

  const props = Object.entries(n.page.properties || {})
    .filter(([k, p]) => p.type !== 'title' && !n.group?.hiddenProps.has(k))
    .map(([k, p]) => [k, propValue(p, { ...ctx, key: k })]).filter(([, v]) => v);
  const meta = props.length ? `<dl class="meta">${props.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '';

  const coverUrl = n.page.cover ? await media(fileUrl(n.page.cover)) : '';
  const icon = n.page.icon?.type === 'emoji' ? n.page.icon.emoji : '';
  const iconImg = n.page.icon && n.page.icon.type !== 'emoji' ? await media(fileUrl(n.page.icon)) : '';
  const rootIcon = rootNode.page.icon?.type === 'emoji' ? rootNode.page.icon.emoji : '';
  const logo = rootNode.page.icon && rootNode.page.icon.type !== 'emoji' ? await media(fileUrl(rootNode.page.icon)) : '';
  const brandText = siteBrand || rootNode.title;

  let pager = '';
  if (n.pager) {
    const { prev, next } = n.pager;
    pager = `<nav class="pager">${prev ? `<a href="${linkFor(prev.id, ctx)}"><small>← Previous</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${linkFor(next.id, ctx)}"><small>Next →</small>${esc(next.title)}</a>` : '<span></span>'}</nav>`;
  }
  const navLinks = siteNav.map((id) => pages.get(id)).filter(Boolean)
    .map((p) => `<a href="${linkFor(p.id, ctx)}"${p.id === n.id || n.parent?.id === p.id && !n.pager ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`).join('');
  const isHome = n.slug === 'index';
  const desc = excerpt(n.blocks) || rootNode.title;
  const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
  const ogImg = coverUrl && siteUrl ? `${siteUrl}/${coverUrl.replace('@@ROOT@@', '')}` : '';
  const favicon = rootIcon
    ? `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${rootIcon}</text></svg>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(isHome ? n.title : `${n.title} — ${rootNode.title}`)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(n.title)}">
<meta property="og:description" content="${esc(desc)}">
${ogImg ? `<meta property="og:image" content="${esc(ogImg)}">` : ''}
${logo ? `<link rel="icon" href="${esc(logo)}">` : favicon ? `<link rel="icon" href="${favicon}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Be+Vietnam+Pro:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${ctx.root}style.css">
</head>
<body class="${isHome ? 'home' : 'sub'}">
<header class="topbar"><a class="brand" href="${ctx.root}index.html" aria-label="${esc(brandText)} — Home">${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : rootIcon ? `<span>${rootIcon}</span>` : ''}<span>${esc(brandText)}</span></a><nav class="site-nav">${navLinks}</nav></header>
${coverUrl ? `<div class="cover"><img src="${esc(coverUrl)}" alt=""></div>` : ''}
<main class="wrap">
<div class="page-head">
${iconImg && !isHome ? `<img class="page-icon" src="${esc(iconImg)}" alt="">` : icon && !isHome ? `<div class="page-icon">${icon}</div>` : ''}
<h1>${esc(n.title)}</h1>
${tagline}
${meta}
</div>
<article class="content">${content}</article>
${pager}
</main>
<footer class="foot">${esc(siteFooter || `© ${new Date().getFullYear()} ${rootNode.title}`)}</footer>
<script src="${ctx.root}main.js" defer></script>
</body>
</html>`;
  return html.replaceAll('@@ROOT@@', ctx.root);
}

// ---------- chạy ----------
await fs.mkdir(CACHE, { recursive: true });
console.log('Đang đọc Notion… (trang gốc: ' + ROOT_ID + ')');
let root;
try { root = await crawlPage(ROOT_ID); }
catch (e) {
  const hints = {
    unauthorized: 'NOTION_TOKEN sai hoặc đã bị thu hồi → tạo lại secret NOTION_TOKEN (mã bắt đầu bằng ntn_).',
    object_not_found: 'Integration chưa được cấp quyền vào trang → mở trang chính trong Notion → ••• → Connections → thêm integration của bạn.',
    restricted_resource: 'Integration chưa được cấp quyền vào trang → mở trang chính trong Notion → ••• → Connections → thêm integration của bạn.',
    validation_error: 'NOTION_PAGE_ID không đúng → dán lại link trang chính Notion.',
  };
  fail((hints[e.code] || 'Lỗi khi đọc Notion') + '\n   Chi tiết: ' + (e.code ? e.code + ' – ' : '') + e.message);
}
assignPagers();
await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(path.join(OUT, 'media'), { recursive: true });
for (const n of pages.values()) {
  if (!n.title.trim()) continue; // trang trống chưa đặt tên
  const html = await renderPage(n, root);
  const dir = n.slug === 'index' ? OUT : path.join(OUT, 'p', n.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), html);
}
for (const name of usedMedia) await fs.copyFile(path.join(CACHE, name), path.join(OUT, 'media', name));
await fs.copyFile(STYLE_SRC, path.join(OUT, 'style.css'));
await fs.copyFile(SCRIPT_SRC, path.join(OUT, 'main.js'));
await fs.writeFile(path.join(OUT, '.nojekyll'), '');
await fs.writeFile(path.join(OUT, '404.html'), (await fs.readFile(path.join(OUT, 'index.html'), 'utf8')));
console.log(`✔ Xong: ${pages.size} trang, ${usedMedia.size} file media → dist/`);
