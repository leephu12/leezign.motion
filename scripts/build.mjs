// Đồng bộ trang Notion → website tĩnh cho GitHub Pages.
// Chạy: NOTION_TOKEN=... NOTION_PAGE_ID=... node scripts/build.mjs
import notionPkg from '@notionhq/client';
const { Client } = notionPkg;
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const OUT = path.resolve('dist');
const CACHE = path.resolve('.cache/media');
const BUILD_V = Date.now().toString(36);
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
  if (!notionHosted) return dropboxRaw(url);
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
let siteOgImage = '';     // ảnh xem trước mặc định (ảnh hero trang chủ)
let analyticsId = '';     // mã thống kê lượt xem (từ dòng 📊 Analytics trong Notion)
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

// Màu theo trang: dòng "🎨 Theme: #nền / #nhấn" (bất kỳ đâu ở cấp ngoài cùng) hoặc ô BG COLOR / ACCENT COLOR
const HEX_RE = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi;
function takeTheme(blocks) {
  let theme = null;
  const out = blocks.filter((b) => {
    if (b.type === 'paragraph' && /^📊\s*analytics\s*:/i.test(textOf(b))) {
      // Dòng "📊 Analytics: <mã GoatCounter hoặc token Cloudflare>" → gắn công cụ đếm lượt xem
      analyticsId = textOf(b).replace(/^📊\s*analytics\s*:\s*/i, '').trim();
      return false;
    }
    if (b.type === 'paragraph' && /^🎨\s*theme\s*:/i.test(textOf(b))) {
      const [bg, accent, text] = textOf(b).match(HEX_RE) || [];
      theme = { bg, accent, text };
      return false;
    }
    return true;
  });
  return { blocks: out, theme };
}
function propTheme(page) {
  const get = (re) => { const e = Object.entries(page.properties || {}).find(([k]) => re.test(k)); return e && plain(e[1].rich_text || []).match(HEX_RE)?.[0]; };
  const bg = get(/^(bg|background)\s*colou?r$/i), accent = get(/^accent\s*colou?r$/i), text = get(/^text\s*colou?r$/i);
  return bg || accent || text ? { bg, accent, text } : null;
}
const hexRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const rgbHex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = (h) => { const [r, g, b] = hexRgb(h).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
function themeStyle(t) {
  if (!t || (!t.bg && !t.accent)) return '';
  const v = [];
  if (t.bg) {
    const light = lum(t.bg) > .4;
    const text = t.text || (light ? '#151515' : '#EDEDEE');
    v.push(`--bg:${t.bg}`, `--text:${text}`, `--surface:${mixHex(t.bg, text, .06)}`, `--line:${mixHex(t.bg, text, .15)}`, `--muted:${mixHex(t.bg, text, .58)}`, `color-scheme:${light ? 'light' : 'dark'}`);
  }
  if (t.accent) v.push(`--accent:${t.accent}`);
  return v.join(';');
}

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
  const navRes = takeNav(await getBlocks(id));
  const { nav } = navRes;
  const { blocks, theme } = takeTheme(navRes.blocks);
  node.theme = propTheme(page) || theme;
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
    if (b.type === 'child_page' && /^🗑/.test(b.child_page?.title || '')) continue;
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
  let ids;
  try {
    let q = await notion.views.queries.create({ view_id: ref.id, page_size: 100 });
    ids = q.results.map((r) => r.id);
    while (q.has_more && q.next_cursor) {
      q = await notion.views.queries.results({ view_id: ref.id, query_id: q.id, start_cursor: q.next_cursor, page_size: 100 });
      ids.push(...q.results.map((r) => r.id));
    }
  } catch (e) {
    // Một số view (nhân bản) có thiết lập sắp xếp hỏng → tự lọc theo bộ lọc của view
    console.warn('  ! view query lỗi (' + e.message + ') → dùng bộ lọc của view');
    const args = { data_source_id: view.data_source_id };
    if (view.filter) args.filter = view.filter;
    let rows;
    try { rows = await paginate((a) => notion.dataSources.query(a), args); }
    catch (e2) { console.warn('  ! lọc thủ công: ' + e2.message); rows = (await paginate((a) => notion.dataSources.query(a), { data_source_id: view.data_source_id })).filter((r) => matchFilter(view.filter, r)); }
    rows.sort((x, y) => x.created_time.localeCompare(y.created_time));
    ids = rows.map((r) => r.id);
  }
  return { view, ids, dsId: view.data_source_id };
}

// Tự đánh giá bộ lọc view đơn giản (multi_select/select contains, checkbox) khi API không lọc được
function matchFilter(f, row) {
  if (!f) return true;
  if (f.and) return f.and.every((x) => matchFilter(x, row));
  if (f.or) return f.or.some((x) => matchFilter(x, row));
  const p = Object.entries(row.properties).find(([k, v]) => k === f.property || v.id === f.property)?.[1];
  if (!p) return true;
  if (f.multi_select?.contains) return (p.multi_select || []).some((o) => o.name === f.multi_select.contains);
  if (f.select?.equals) return p.select?.name === f.select.equals;
  if (f.checkbox && 'equals' in f.checkbox) return !!p.checkbox === f.checkbox.equals;
  return true;
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
  let gb = res.view?.configuration?.group_by || res.view?.group_by;
  // API chưa trả về nhóm cho gallery → gallery không lọc (tất cả dự án, VD trang Work) tự nhóm theo TAGS
  if (!gb && res.view && !res.view.filter && res.dsId) {
    const schema = await schemaOf(res.dsId);
    if (schema.TAGS?.type === 'multi_select') gb = { type: 'multi_select', property_name: 'TAGS' };
  }
  if (gb && ['select', 'multi_select'].includes(gb.type) && res.dsId) {
    const schema = await schemaOf(res.dsId);
    const [name, prop] = Object.entries(schema).find(([k, v]) => v.id === gb.property_id || k === gb.property_name) || [];
    if (name) {
      const options = prop[prop.type]?.options || [];
      const valueOf = (n) => { const p = n.page.properties[name]; return p?.type === 'select' ? [p.select?.name].filter(Boolean) : (p?.multi_select || []).map((o) => o.name); };
      group.groups = options.map((o) => ({ name: o.name, items: items.filter((n) => valueOf(n).includes(o.name)) }))
        .filter((g) => g.items.length);
      // nhóm tự động mà có bài không gắn tag (VD: Articles) → hiện dạng lưới thường để không mất bài nào
      if (!(res.view?.configuration?.group_by || res.view?.group_by) && items.some((n) => !valueOf(n).length)) delete group.groups;
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
// Chữ trượt khi hover: chữ cũ trượt lên, chữ mới trượt vào từ dưới (không đổi kích thước nút)
const roll = (text) => `<span class="roll"><span data-text="${esc(text)}">${esc(text)}</span></span>`;
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

// ---------- link ngoài: tỉ lệ video (oEmbed) + thẻ có ảnh cover (og:image) ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const fetchCache = new Map();
async function getText(url, json = false) {
  const key = url + json;
  if (!fetchCache.has(key)) fetchCache.set(key, (async () => {
    try {
      const ctl = AbortSignal.timeout(12000);
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en' }, redirect: 'follow', signal: ctl });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return json ? await res.json() : await res.text();
    } catch (e) { console.warn('  ! không đọc được ' + url + ': ' + e.message); return null; }
  })());
  return fetchCache.get(key);
}
async function videoRatio(url) {
  let api = null;
  if (/vimeo\.com/.test(url)) api = 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(url.replace('player.vimeo.com/video/', 'vimeo.com/'));
  else if (/youtu/.test(url)) api = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url);
  const j = api && await getText(api, true);
  return j?.width && j?.height ? { w: j.width, h: j.height } : null;
}
async function embedFigure(src, origUrl, b, ctx) {
  const r = await videoRatio(origUrl);
  const portrait = r && r.h > r.w;
  const style = r ? ` style="aspect-ratio:${r.w} / ${r.h}${portrait ? `;max-width:min(100%, calc(80vh * ${r.w} / ${r.h}))` : ''}"` : '';
  return `<figure class="media"><div class="ratio${portrait ? ' portrait' : ''}"${style}><iframe src="${esc(src)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>${b ? caption(b, ctx) : ''}</figure>`;
}
const decodeEnt = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
async function ogInfo(url) {
  const html = await getText(url);
  if (!html) return {};
  const meta = (k) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, 'i'));
    return m ? decodeEnt(m[1]).trim() : '';
  };
  let image = meta('og:image') || meta('twitter:image');
  if (image) try { image = new URL(image, url).href; } catch {}
  return { image, title: meta('og:title') || meta('twitter:title') || decodeEnt(html.match(/<title[^>]*>([^<]*)/i)?.[1] || '').trim(), desc: meta('og:description'), site: meta('og:site_name') };
}
// Tải ảnh ngoài (ảnh cover bài báo…) về website → không phụ thuộc site gốc (http, chặn hotlink…)
async function cacheExternal(url) {
  try {
    const u = new URL(url);
    const ext = (path.extname(u.pathname) || '.jpg').toLowerCase().slice(0, 5);
    const name = 'x' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 15) + (/^\.(jpe?g|png|gif|webp|avif)$/.test(ext) ? ext : '.jpg');
    const file = path.join(CACHE, name);
    if (!fss.existsSync(file)) {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      if (!res.ok || !/image/.test(res.headers.get('content-type') || '')) throw new Error('HTTP ' + res.status);
      await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
    }
    usedMedia.add(name);
    return '@@ROOT@@media/' + name;
  } catch (e) { console.warn('  ! không tải được ảnh ' + url + ': ' + e.message); return url.replace(/^http:/, 'https:'); }
}
async function linkCard(url, label) {
  const og = await ogInfo(url);
  if (og.image) og.image = await cacheExternal(og.image);
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const behance = url.match(/behance\.net\/gallery\/(\d+)/);
  if (!og.image && behance) // không đọc được trang → dùng khung nhúng chính thức của Behance (có cover, bấm mở Behance)
    return `<figure class="media behance-embed"><div class="ratio" style="aspect-ratio:404 / 316;max-width:404px"><iframe src="https://www.behance.net/embed/project/${behance[1]}?ilo0=1" allowfullscreen loading="lazy" allow="clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe></div><a class="bookmark" href="${esc(url)}" target="_blank" rel="noopener"><span>${esc(label || 'Xem trên Behance')}</span><span class="arrow">↗</span></a></figure>`;
  const title = label || og.title || url.replace(/^https?:\/\//, '');
  return `<a class="link-card${og.image ? '' : ' no-img'}" href="${esc(url)}" target="_blank" rel="noopener">`
    + (og.image ? `<span class="lc-img"><img src="${esc(og.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></span>` : '')
    + `<span class="lc-body"><span class="lc-title">${esc(title)}</span>${og.desc ? `<span class="lc-desc">${esc(og.desc)}</span>` : ''}<span class="lc-host">${esc(og.site || host)} ↗</span></span></a>`;
}
// Link video (YouTube / Vimeo / Loom / Dropbox / file .mp4…) → khung video; không phải video → null
const isVideoLink = (u) => !!u && (!!videoEmbed(u) || isVideoFile(u));
async function videoFromLink(url, b, ctx, poster = '') {
  if (!url) return null;
  const emb = videoEmbed(url);
  if (emb) return embedFigure(emb, url, b, ctx);
  if (isVideoFile(url)) return `<figure class="media">${videoTag(dropboxRaw(url)).replace('<video ', poster ? `<video poster="${esc(poster)}" ` : '<video ')}${b ? caption(b, ctx) : ''}</figure>`;
  return null;
}
// Các link nằm trong đoạn chữ (bỏ link nội bộ Notion)
const linksIn = (r) => (r || []).map((x) => x.href).filter((h) => h && /^https?:/.test(h) && !/notion\.(so|site|com)/.test(h));
// Bỏ tham số theo dõi (fbclid, utm…) khỏi link
const cleanUrl = (u) => { try { const x = new URL(u); [...x.searchParams.keys()].filter((k) => /^(fbclid|utm_|gclid|mibextid)/i.test(k)).forEach((k) => x.searchParams.delete(k)); return x.href; } catch { return u; } };
const isVideoFile = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u);
// Link Dropbox dạng xem (…&dl=0) → link file thật (raw=1) để <video>/<img> phát được
const dropboxRaw = (u) => {
  if (!u || !/^(https?:\/\/)?([\w-]+\.)?dropbox\.com\//.test(u)) return u;
  try { const x = new URL(u); x.searchParams.delete('dl'); x.searchParams.set('raw', '1'); return x.href; } catch { return u; }
};
// Emoji dán từ Facebook (ảnh static.xx.fbcdn.net/emoji.php) → hiển thị bằng chữ emoji
const fbEmoji = (u) => { const m = (u || '').match(/fbcdn\.net\/images\/emoji\.php\/.*\/([0-9a-f_]+)\.png/i); return m ? m[1].split('_').map((h) => String.fromCodePoint(parseInt(h, 16))).join('') : null; };
const isImageFile = (u) => /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u);
const videoTag = (src, cls = '') =>
  `<video class="${cls}" src="${esc(src)}" muted loop playsinline autoplay preload="metadata" controls></video>`;

const CTA_RE = /let.?s\s+work\s+together|work\s+with\s+me|get\s+in\s+touch|let.?s\s+talk/i;
async function renderBlocks(blocks, ctx) {
  let html = '';
  let inCta = false; // khu "Let's work together": tiêu đề + các dòng bên dưới, tới vạch kẻ / tiêu đề kế tiếp
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const isHead = /^heading_/.test(b.type);
    if (inCta && (isHead || ['divider', 'equation', 'child_database', 'column_list'].includes(b.type))) { html += '</section>'; inCta = false; }
    if (isHead && CTA_RE.test(plain(b[b.type].rich_text))) { html += '<section class="cta">'; inCta = true; }
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
    if (/^heading_/.test(b.type) && plain(b[b.type].rich_text).trim()) ctx.heading = plain(b[b.type].rich_text);
    html += await renderBlock(b, ctx);
  }
  if (inCta) html += '</section>';
  return html;
}

async function renderBlock(b, ctx) {
  const d = b[b.type] || {};
  const kids = async () => (b.children ? await renderBlocks(b.children, ctx) : '');
  switch (b.type) {
    case 'paragraph': {
      if (isGlobe(b)) return globeHtml(b);
      const t = rt(d.rich_text, ctx);
      // Đoạn chỉ gồm một link kết thúc bằng "→" (VD: "View all Branding →") hiển thị như nút bấm
      const r = d.rich_text || [];
      const onlyLinks = r.length && r.every((x) => x.href || !x.plain_text.trim());
      if (onlyLinks && linksIn(r).length === 1 && isVideoLink(linksIn(r)[0])) return videoFromLink(linksIn(r)[0], null, ctx);
      if (r.length && r.every((x) => x.href || !x.plain_text.trim()) && /→\s*$/.test(plain(r))) {
        const href = mapHref(r.find((x) => x.href).href, ctx);
        return `<p class="more"><a class="btn" href="${esc(href)}">${roll(plain(r).trim())}</a></p>`;
      }
      return (t ? `<p class="${colorCls(d.color).trim()}">${t}</p>` : '<div class="spacer"></div>') + await kids();
    }
    case 'heading_1': case 'heading_2': case 'heading_3': {
      const lvl = Number(b.type.slice(-1)) + 1; // h1 dành cho tiêu đề trang
      const r = d.rich_text || [];
      // Tiêu đề chỉ gồm 1 link ngoài (VD: "Press & Features" → bài báo) → tiêu đề + thẻ bài viết có ảnh cover
      const hl = linksIn(r);
      if (hl.length === 1 && r.every((x) => x.href || !x.plain_text.trim()) && !d.is_toggleable) {
        const text = plain(r).trim();
        const card = isVideoLink(hl[0]) ? await videoFromLink(hl[0], null, ctx) : await linkCard(cleanUrl(hl[0]), '');
        return `<h${lvl} class="${colorCls(d.color).trim()}">${esc(text)}</h${lvl}>${card}`;
      }
      const h = `<h${lvl} class="${colorCls(d.color).trim()}">${rt(d.rich_text, ctx)}</h${lvl}>`;
      return d.is_toggleable ? `<details><summary>${h}</summary>${await kids()}</details>` : h;
    }
    case 'quote': return `<blockquote class="${colorCls(d.color).trim()}">${rt(d.rich_text, ctx)}${await kids()}</blockquote>`;
    case 'callout': {
      // Callout chứa link video (trong chữ, hoặc khối link/embed bên trong) → hiển thị video, bỏ khung callout
      const vids = linksIn(d.rich_text).filter(isVideoLink);
      if (vids.length) {
        const rest = (d.rich_text || []).filter((x) => !x.href || !isVideoLink(x.href));
        const restText = plain(rest).trim() && !/^https?:\/\/\S+$/.test(plain(rest).trim()) ? `<p>${rt(rest, ctx)}</p>` : '';
        let out = ''; for (const u of vids) out += await videoFromLink(u, null, ctx);
        return `<div class="callout-video">${restText}${out}${await kids()}</div>`;
      }
      if ((b.children || []).length && b.children.every((c) => isBlank(c) || ['video', 'embed', 'link_preview', 'bookmark'].includes(c.type) && isVideoLink(c[c.type]?.url || fileUrl(c[c.type])) || c.type === 'paragraph' && linksIn(c.paragraph.rich_text).some(isVideoLink))
        && !plain(d.rich_text).trim()) return `<div class="callout-video">${await kids()}</div>`;
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
      const emo = fbEmoji(fileUrl(d));
      if (emo) return `<p class="emoji-line">${emo}</p>`;
      const src = await media(fileUrl(d));
      const capLinks = linksIn(d.caption);
      const capText = plain(d.caption).trim();
      const capIsLink = capLinks.length && (capText === '' || /^https?:\/\/\S+$/.test(capText) || (d.caption || []).every((x) => x.href || !x.plain_text.trim()));
      if (src && capLinks.length) {
        const vid = isVideoLink(capLinks[0]) && await videoFromLink(capLinks[0], capIsLink ? null : b, ctx, src);
        if (vid) return vid;
        return `<figure class="media"><a class="img-link" href="${esc(capLinks[0])}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(capText)}" loading="lazy"></a>${capIsLink ? '' : caption(b, ctx)}</figure>`;
      }
      return src ? `<figure class="media"><img src="${esc(src)}" alt="${esc(plain(d.caption))}" loading="lazy">${caption(b, ctx)}</figure>` : '';
    }
    case 'video': {
      const raw = fileUrl(d); if (!raw) return '';
      const emb = d.type === 'external' && videoEmbed(raw);
      if (emb) return embedFigure(emb, raw, b, ctx);
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
      if (emb) return embedFigure(emb, url, b, ctx);
      if (isImageFile(url)) return `<figure class="media"><img src="${esc(dropboxRaw(url))}" loading="lazy" alt="">${caption(b, ctx)}</figure>`;
      if (isVideoFile(url)) return `<figure class="media">${videoTag(dropboxRaw(url))}${caption(b, ctx)}</figure>`;
      if (/dropbox\.com|behance\.net|dribbble\.com|artstation\.com|instagram\.com|facebook\.com|linkedin\.com/i.test(url)) return linkCard(url, plain(d.caption));
      return `<figure class="media"><div class="ratio"><iframe src="${esc(url)}" loading="lazy" allowfullscreen></iframe></div>${caption(b, ctx)}</figure>`;
    }
    case 'bookmark': {
      const url = d.url; if (!url) return '';
      const emb = videoEmbed(url);
      if (emb) return embedFigure(emb, url, b, ctx);
      if (/dropbox\.com/.test(url) && isVideoFile(url)) return `<figure class="media">${videoTag(dropboxRaw(url))}${caption(b, ctx)}</figure>`;
      if (/dropbox\.com/.test(url) && isImageFile(url)) return `<figure class="media"><img src="${esc(dropboxRaw(url))}" loading="lazy" alt="">${caption(b, ctx)}</figure>`;
      return linkCard(url, plain(d.caption));
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
        return `<nav class="tag-row">${pills.map((p) => `<a href="${esc(p.href)}">${p.icon ? `<span class="ico">${p.icon}</span>` : ''}${roll(p.label)}</a>`).join('')}</nav>`;
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
      if (ctx.node.slug === 'index' && ctx.heading) {
        // Trang chủ: 1 hàng xem trước. Dự án FEATURED đứng trước, còn chỗ thì lấp bằng các dự án khác cùng danh mục
        const cat = [...pages.values()].find((x) => x !== ctx.node && !x.page.parent?.data_source_id && !x.page.parent?.database_id && x.title.trim().toLowerCase() === ctx.heading.trim().toLowerCase());
        const full = cat ? Object.values(cat.databases || {}).filter(Boolean).flatMap((x) => x.items) : [];
        const items = [...new Set([...g.items, ...full])].slice(0, 4);
        return `<section class="gallery preview">${await rowsHtml(items, ctx)}</section>`;
      }
      const grid = (items) => rowsHtml(items, ctx);
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
// Ưu tiên ảnh/GIF/video upload trong trang; link video Dropbox chỉ dùng khi trang không có media nào khác
function findFirstMedia(blocks, allowLinks = false) {
  if (allowLinks === false) { const r = findFirstMedia(blocks, null); if (r) return r; return findFirstMedia(blocks, true); }
  for (const b of blocks || []) {
    if (b.type === 'image' && fbEmoji(fileUrl(b.image))) continue;
    if (b.type === 'image' || b.type === 'video') return { kind: b.type, url: fileUrl(b[b.type]), external: b[b.type].type === 'external' };
    if (allowLinks === true && (b.type === 'link_preview' || b.type === 'bookmark') && isVideoFile(b[b.type].url || ''))
      return { kind: 'video', url: b[b.type].url, external: true };
    if (b.type === 'embed' && b.embed.url && (isImageFile(b.embed.url) || isVideoFile(b.embed.url)))
      return { kind: isVideoFile(b.embed.url) ? 'video' : 'image', url: b.embed.url, external: true };
    const inner = findFirstMedia(b.children, allowLinks); if (inner) return inner;
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
// Lưới dự án: chia hàng 4 thẻ; rê chuột vào thẻ nào thẻ đó nở rộng, đẩy các thẻ cùng hàng
async function rowsHtml(items, ctx, per = 4) {
  let out = '';
  for (let i = 0; i < items.length; i += per) {
    let c = ''; for (const n of items.slice(i, i + per)) c += await card(n, ctx);
    const k = Math.min(per, items.length - i);
    out += k < per ? `<div class="row partial" style="--n:${k}">${c}</div>` : `<div class="row">${c}</div>`;
  }
  return `<div class="grid rows">${out}</div>`;
}
async function card(n, ctx) {
  const t = tags(n);
  return `<a class="card" href="${linkFor(n.id, ctx)}">${await thumbHtml(n)}<div class="card-body"><h3>${esc(n.title)}</h3>${t.length ? `<p class="tags">${t.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}</div></a>`;
}

// Tag (TAGS) dẫn tới trang danh mục cùng tên (Branding, Motion Graphics…)
function tagLink(name, ctx) {
  const key = name.trim().toLowerCase();
  for (const n of pages.values()) if (!n.page.parent?.data_source_id && !n.page.parent?.database_id && n.title.trim().toLowerCase() === key) return linkFor(n.id, ctx);
  return null;
}
const chip = (name, ctx) => { const l = tagLink(name, ctx); return l ? `<a class="chip" href="${l}">${esc(name)}</a>` : `<span class="chip">${esc(name)}</span>`; };
function propValue(p, ctx) {
  switch (p.type) {
    case 'rich_text': return rt(p.rich_text, ctx);
    case 'select': return p.select ? chip(p.select.name, ctx) : '';
    case 'status': return '';
    case 'multi_select': return p.multi_select.map((s) => chip(s.name, ctx)).join('');
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

// Mô tả trang cho Google / Facebook: cột Summary → đoạn văn đầu tiên đủ dài (bỏ dòng ngắn kiểu "View all …")
function excerpt(blocks, page) {
  const sumProp = Object.entries(page?.properties || {}).find(([k, p]) => /^(summary|description|mô tả|tóm tắt)$/i.test(k) && p.type === 'rich_text');
  let t = sumProp ? plain(sumProp[1].rich_text).trim() : '';
  if (!t) {
    const parts = [];
    for (const b of blocks || []) {
      if (!['paragraph', 'quote', 'callout'].includes(b.type)) continue;
      const r = b[b.type].rich_text || [];
      const x = plain(r).replace(/\s+/g, ' ').trim();
      if (!x || x.length < 25 || /→\s*$/.test(x) || /^https?:\/\//.test(x) || /^[←→]/.test(x)) continue;
      parts.push(x);
      if (parts.join(' ').length >= 140) break;
    }
    t = parts.join(' ');
  }
  if (t.length > 160) t = t.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  return t;
}
const SITE_URL = (process.env.SITE_URL || (process.env.GITHUB_REPOSITORY
  ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0].toLowerCase()}.github.io/${process.env.GITHUB_REPOSITORY.split('/')[1]}`
  : '')).replace(/\/$/, '');
const sitemap = [];

async function renderPage(n, rootNode) {
  const depth = n.slug === 'index' ? 0 : 2;
  const ctx = { root: depth ? '../../' : '', node: n };
  let blocks = n.blocks;
  let tagline = '', taglineText = '';
  const firstIdx = blocks.findIndex((b) => !isBlank(b));
  if (n.slug === 'index' && /^heading_/.test(blocks[firstIdx]?.type || '')) {
    tagline = `<h3 class="tagline">${rt(blocks[firstIdx][blocks[firstIdx].type].rich_text, ctx)}</h3>`;
    taglineText = plain(blocks[firstIdx][blocks[firstIdx].type].rich_text).trim();
    blocks = blocks.filter((_, i) => i !== firstIdx);
  }
  let heroImg = '';
  if (n.slug === 'index') {
    // Ảnh đầu tiên nằm trước hàng nút danh mục = ảnh chân dung ở hero
    const firstCols = blocks.findIndex((b) => b.type === 'column_list' || b.type === 'child_database');
    const imgIdx = blocks.findIndex((b, i) => b.type === 'image' && (firstCols < 0 || i < firstCols));
    if (imgIdx >= 0) { heroImg = await media(fileUrl(blocks[imgIdx].image)); blocks = blocks.filter((_, i) => i !== imgIdx); }
  }
  let content = /^about/i.test(n.title.trim()) ? await renderAbout(blocks, ctx) : await renderBlocks(blocks, ctx);

  const props = Object.entries(n.page.properties || {})
    .filter(([k, p]) => p.type !== 'title' && !n.group?.hiddenProps.has(k) && !/colou?r$/i.test(k) && !/^(summary|description|mô tả|tóm tắt)$/i.test(k))
    .map(([k, p]) => [k, propValue(p, { ...ctx, key: k })]).filter(([, v]) => v);
  const meta = props.length ? `<dl class="meta">${props.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '';

  const coverUrl = n.page.cover ? await media(fileUrl(n.page.cover)) : '';
  const icon = n.page.icon?.type === 'emoji' ? n.page.icon.emoji : '';
  const iconImg = n.page.icon && n.page.icon.type !== 'emoji' ? await media(fileUrl(n.page.icon)) : '';
  const rootIcon = rootNode.page.icon?.type === 'emoji' ? rootNode.page.icon.emoji : '';
  const logo = rootNode.page.icon && rootNode.page.icon.type !== 'emoji' ? await media(fileUrl(rootNode.page.icon)) : '';
  const brandText = siteBrand || rootNode.title;
  let theme = n.theme;
  if (!theme) {
    const tags = Object.values(n.page.properties || {}).find((p) => p.type === 'multi_select')?.multi_select || [];
    for (const t of tags) {
      const cat = [...pages.values()].find((x) => !x.page.parent?.data_source_id && !x.page.parent?.database_id && x.title.trim().toLowerCase() === t.name.trim().toLowerCase());
      if (cat?.theme) { theme = cat.theme; break; }
    }
  }
  theme ||= rootNode.theme;
  const bodyStyle = themeStyle(theme);

  let pager = '';
  if (n.pager) {
    const { prev, next } = n.pager;
    pager = `<nav class="pager">${prev ? `<a href="${linkFor(prev.id, ctx)}"><small>← Previous</small>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${linkFor(next.id, ctx)}"><small>Next →</small>${esc(next.title)}</a>` : '<span></span>'}</nav>`;
  }
  const navLinks = siteNav.map((id) => pages.get(id)).filter(Boolean)
    .map((p) => `<a href="${linkFor(p.id, ctx)}"${p.id === n.id || n.parent?.id === p.id && !n.pager ? ' aria-current="page"' : ''}>${roll(p.title)}</a>`).join('');
  const isHome = n.slug === 'index';
  const desc = (isHome ? taglineText : '') || excerpt(n.blocks, n.page) || `${n.title} — ${rootNode.title}`;
  const siteUrl = SITE_URL;
  const pageUrl = siteUrl ? `${siteUrl}/${isHome ? '' : `p/${n.slug}/`}` : '';
  // Ảnh xem trước khi share: ảnh hero (trang chủ) → thumbnail dự án (ảnh) → ảnh cover → ảnh hero trang chủ
  let ogSrc = heroImg || '';
  if (!ogSrc) { const t = thumbSource(n); if (t?.url && t.kind === 'image' && !fbEmoji(t.url)) ogSrc = await media(t.url); }
  if (!ogSrc && coverUrl) ogSrc = coverUrl;
  if (!ogSrc) ogSrc = siteOgImage;
  if (isHome && ogSrc) siteOgImage = ogSrc;
  const ogImg = ogSrc && siteUrl ? (/^https?:/.test(ogSrc) ? ogSrc : `${siteUrl}/${ogSrc.replace('@@ROOT@@', '')}`) : '';
  if (pageUrl) sitemap.push(pageUrl);
  const analytics = !analyticsId ? '' : /^[0-9a-f]{32}$/i.test(analyticsId)
    ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(analyticsId)}"}'></script>`
    : `<script data-goatcounter="https://${esc(analyticsId.replace(/^https?:\/\//, '').replace(/\.goatcounter\.com.*$/, ''))}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>`;
  const favicon = rootIcon
    ? `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${rootIcon}</text></svg>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${theme?.bg ? `<meta name="theme-color" content="${theme.bg}">` : ''}
<title>${esc(isHome ? n.title : `${n.title} — ${rootNode.title}`)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="${isHome ? 'website' : 'article'}">
<meta property="og:site_name" content="${esc(siteBrand || rootNode.title)}">
<meta property="og:title" content="${esc(isHome ? n.title : `${n.title} — ${rootNode.title}`)}">
<meta property="og:description" content="${esc(desc)}">
${pageUrl ? `<meta property="og:url" content="${esc(pageUrl)}">\n<link rel="canonical" href="${esc(pageUrl)}">` : ''}
${ogImg ? `<meta property="og:image" content="${esc(ogImg)}">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="${esc(ogImg)}">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${esc(n.title)}">
<meta name="twitter:description" content="${esc(desc)}">
${logo ? `<link rel="icon" href="${esc(logo)}">` : favicon ? `<link rel="icon" href="${favicon}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Be+Vietnam+Pro:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${ctx.root}style.css?v=${BUILD_V}">
</head>
<body class="${isHome ? 'home' : 'sub'} page-${n.slug}"${bodyStyle ? ` style="${bodyStyle}"` : ''}>
<header class="topbar"><a class="brand" href="${ctx.root}index.html" aria-label="${esc(brandText)} — Home">${logo ? `<img class="logo" src="${esc(logo)}" alt="">` : rootIcon ? `<span>${rootIcon}</span>` : ''}<span>${esc(brandText)}</span></a><nav class="site-nav">${navLinks}</nav></header>
<main class="wrap">
${coverUrl && !heroImg ? `<div class="cover"><img src="${esc(coverUrl)}" alt=""></div>` : ''}
<div class="page-head${heroImg ? ' hero' : ''}">
${heroImg ? `<figure class="hero-img"><img src="${esc(heroImg)}" alt="${esc(n.title)}"></figure><div class="hero-text">` : ''}
${iconImg && !isHome ? `<img class="page-icon" src="${esc(iconImg)}" alt="">` : icon && !isHome ? `<div class="page-icon">${icon}</div>` : ''}
<h1>${esc(n.title)}</h1>
${tagline}
${meta}
${heroImg ? '</div>' : ''}
</div>
<article class="content">${content}</article>
${pager}
</main>
<footer class="foot">${esc(siteFooter || `© ${new Date().getFullYear()} ${rootNode.title}`)}</footer>
<script src="${ctx.root}main.js?v=${BUILD_V}" defer></script>
${content.includes('globe-scene') ? `<script src="${ctx.root}globe.js?v=${BUILD_V}" defer></script>` : ''}
${analytics}
</body>
</html>`;
  return (await gifsToVideo(html)).replaceAll('@@ROOT@@', ctx.root);
}

// Dòng "🌏 Based in …" → cảnh quả địa cầu cuộn (chữ số 0/1 → Việt Nam)
const GLOBE_RE = /^🌏\s*/;
const isGlobe = (b) => b.type === 'paragraph' && GLOBE_RE.test(plain(b.paragraph.rich_text).trim());
function globeHtml(b) {
  const text = plain(b.paragraph.rich_text).trim().replace(GLOBE_RE, '');
  const m = text.match(/^(based in|located in|sống tại|ở)\s+(.*)$/i);
  const kicker = m ? m[1] : '', place = m ? m[2] : text;
  return `<section class="globe-scene" aria-label="${esc(text)}"><div class="globe-sticky"><canvas></canvas>`
    + `<div class="globe-caption">${kicker ? `<p class="g-kicker">${esc(kicker)}</p>` : ''}<p class="g-place">${esc(place)}</p></div></div></section>`;
}

// ---------- Trang About: bố cục 2 cột (nhãn trái / nội dung phải), số liệu, khối liên hệ chữ lớn ----------
const CONTACT_RE = /contact|social|get\s+in\s+touch|liên hệ/i;
function linkTag(href) {
  if (/^mailto:/i.test(href)) return 'Mail';
  if (/^tel:/i.test(href)) return 'Call';
  if (/linkedin\./i.test(href)) return 'Connect';
  if (/behance\.|dribbble\.|vimeo\.|youtube\.|artstation\./i.test(href)) return 'Portfolio';
  return 'Follow';
}
const waveText = (t) => `<span class="wave" aria-hidden="true">${[...t].map((c) => c === ' ' ? '<span class="sp"> </span>' : `<span>${esc(c)}</span>`).join('')}</span><span class="sr">${esc(t)}</span>`;
async function renderAbout(blocks, ctx) {
  // Gom khối theo tiêu đề (heading 1/2/3): mỗi tiêu đề = 1 hàng
  const sections = []; let cur = { head: null, blocks: [] };
  for (const b of blocks) {
    if (/^heading_[123]$/.test(b.type) && plain(b[b.type].rich_text).trim()) { sections.push(cur); cur = { head: b, blocks: [] }; }
    else cur.blocks.push(b);
  }
  sections.push(cur);
  let html = '';
  for (const sec of sections) {
    const label = sec.head ? plain(sec.head[sec.head.type].rich_text).trim() : '';
    const headLinks = sec.head ? linksIn(sec.head[sec.head.type].rich_text) : [];
    // Ảnh / video lớn tách ra hiển thị tràn ngang sau hàng
    const wide = sec.blocks.filter((b) => isGlobe(b) || ['image', 'video'].includes(b.type) && !fbEmoji(fileUrl(b[b.type])));
    const body = sec.blocks.filter((b) => !wide.includes(b) && !isBlank(b));
    if (label && CONTACT_RE.test(label)) {
      // Khối liên hệ: mọi link trong mục → dòng chữ lớn, nhãn nhỏ (MAIL / CALL / FOLLOW…)
      const links = [];
      const collect = (arr) => (arr || []).forEach((b) => {
        const r = b[b.type]?.rich_text;
        if (r) r.forEach((x) => { if (x.href && x.plain_text.trim()) links.push({ href: mapHref(x.href, ctx), text: x.plain_text.trim() }); });
        collect(b.children);
      });
      collect(body);
      const rows = links.map((l) => `<li><a${l.text.length > 13 ? ' class="long"' : ''} href="${esc(l.href)}"${/^https?:/.test(l.href) ? ' target="_blank" rel="noopener"' : ''}>${waveText(l.text.toUpperCase())}<sup>${linkTag(l.href)}</sup></a></li>`).join('');
      html += `<section class="ab-contact"><p class="ab-kicker">${esc(label)}</p><ul class="big-links">${rows}</ul></section>`;
      continue;
    }
    let inner = '';
    if (headLinks.length === 1) inner += await linkCard(cleanUrl(headLinks[0]), '');
    // Dòng bắt đầu bằng số in đậm (VD: **10+** Years of experience) → hàng số liệu
    let run = [];
    for (const b of body) {
      const r = b.type === 'paragraph' ? b.paragraph.rich_text || [] : null;
      const first = r && r.find((x) => x.plain_text.trim());
      if (first && first.annotations?.bold && /^[\d.,]+\s*[+%kKmM]*$/.test(first.plain_text.trim())) {
        if (run.length) { inner += await renderBlocks(run, ctx); run = []; }
        const rest = r.slice(r.indexOf(first) + 1);
        const restHtml = rt(rest, ctx).replace(/^\s*[—–:-]\s*/, '');
        inner += `<div class="num-row"><span class="num">${esc(first.plain_text.trim())}</span><span class="num-txt">${restHtml}</span></div>`;
      } else run.push(b);
    }
    if (run.length) inner += await renderBlocks(run, ctx);
    if (label || inner) {
      html += `<section class="ab-row${label ? '' : ' ab-intro'}"><h2 class="ab-label">${label ? esc(label) : ''}</h2><div class="ab-body">${inner}</div></section>`;
    }
    for (const w of wide) html += isGlobe(w) ? globeHtml(w) : `<div class="ab-wide">${await renderBlocks([w], ctx)}</div>`;
  }
  return html;
}

// ---------- GIF → video MP4 (nhẹ hơn ~5–10 lần, vẫn tự chạy + lặp như GIF) ----------
const run = (cmd, args) => new Promise((ok, no) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (e, so, se) => (e ? no(new Error(se || e.message)) : ok(so))));
let hasFfmpeg = null;
const gifJobs = new Map(); // tên gif → Promise<{ mp4, jpg } | null>
function gifHasAlpha(buf) {
  // Khung đầu tiên có bật nền trong suốt (Graphic Control Extension) → giữ GIF để không mất nền trong suốt
  for (let i = 13; i < Math.min(buf.length - 4, 1 << 20); i++) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xf9 && buf[i + 2] === 0x04) return (buf[i + 3] & 1) === 1;
    if (buf[i] === 0x2c) break; // tới khung ảnh đầu tiên mà không có GCE
  }
  return false;
}
function convertGif(name) {
  if (!gifJobs.has(name)) gifJobs.set(name, (async () => {
    if (hasFfmpeg === null) hasFfmpeg = await run('ffmpeg', ['-version']).then(() => true, () => false);
    if (!hasFfmpeg) return null;
    const src = path.join(CACHE, name), base = name.replace(/\.gif$/i, '');
    const mp4 = base + '.mp4', jpg = base + '.jpg';
    try {
      if (!fss.existsSync(path.join(CACHE, mp4))) {
        const buf = await fs.readFile(src);
        if (gifHasAlpha(buf)) return null;
        await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-an', path.join(CACHE, mp4)]);
        await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-q:v', '3', path.join(CACHE, jpg)]);
        // video lớn hơn GIF thì giữ GIF
        if ((await fs.stat(path.join(CACHE, mp4))).size >= buf.length) { await fs.writeFile(path.join(CACHE, mp4 + '.skip'), ''); }
      }
      if (fss.existsSync(path.join(CACHE, mp4 + '.skip')) || !fss.existsSync(path.join(CACHE, jpg))) return null;
      return { mp4, jpg };
    } catch (e) { console.warn('  ! không chuyển được GIF ' + name + ': ' + e.message.slice(0, 200)); return null; }
  })());
  return gifJobs.get(name);
}
const convertedGifs = new Map(); // gif → { mp4, jpg } (để chép file + bỏ GIF khỏi website)
async function gifsToVideo(html) {
  const names = [...new Set([...html.matchAll(/@@ROOT@@media\/([\w-]+\.gif)/gi)].map((m) => m[1]))];
  for (const name of names) {
    const r = await convertGif(name);
    if (!r) continue;
    convertedGifs.set(name, r);
    const url = '@@ROOT@@media/' + name;
    // <img src="….gif"> → <video> tự chạy, lặp, không tiếng (giống GIF), ảnh khung đầu làm hình chờ
    html = html.replace(new RegExp(`<img([^>]*?)\\ssrc="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"([^>]*)>`, 'g'), (m, a, b) => {
      const attrs = (a + b).replace(/\s(loading|onerror|referrerpolicy|alt)="[^"]*"/g, '');
      return `<video${attrs} class="gifv" src="@@ROOT@@media/${r.mp4}" poster="@@ROOT@@media/${r.jpg}" muted loop playsinline autoplay preload="metadata"></video>`;
    });
    // ảnh xem trước khi share (og:image) → ảnh JPG khung đầu
    html = html.replaceAll(`media/${name}"`, `media/${r.jpg}"`);
  }
  return html;
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
const ordered = [...pages.values()].sort((a, b) => (b.slug === 'index') - (a.slug === 'index')); // trang chủ trước
for (const n of ordered) {
  if (!n.title.trim() || /^🗑/.test(n.title)) continue; // trang trống / trang dọn dẹp
  const html = await renderPage(n, root);
  const dir = n.slug === 'index' ? OUT : path.join(OUT, 'p', n.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), html);
}
for (const [gif, r] of convertedGifs) { usedMedia.delete(gif); usedMedia.add(r.mp4); usedMedia.add(r.jpg); }
if (convertedGifs.size) console.log(`  ↻ ${convertedGifs.size} GIF đã chuyển sang video MP4`);
for (const name of usedMedia) await fs.copyFile(path.join(CACHE, name), path.join(OUT, 'media', name));
await fs.copyFile(STYLE_SRC, path.join(OUT, 'style.css'));
await fs.copyFile(SCRIPT_SRC, path.join(OUT, 'main.js'));
await fs.copyFile(path.resolve('site/globe.js'), path.join(OUT, 'globe.js'));
await fs.writeFile(path.join(OUT, '.nojekyll'), '');
if (SITE_URL) {
  const today = new Date().toISOString().slice(0, 10);
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}
await fs.writeFile(path.join(OUT, '404.html'), (await fs.readFile(path.join(OUT, 'index.html'), 'utf8')));
console.log(`✔ Xong: ${pages.size} trang, ${usedMedia.size} file media → dist/`);
