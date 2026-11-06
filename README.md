# Portfolio tự đồng bộ từ Notion → GitHub Pages (miễn phí)

Bạn vẫn cập nhật portfolio trong Notion như bây giờ. Website trên GitHub Pages tự đọc Notion và cập nhật **mỗi 30 phút** (hoặc ngay lập tức khi bấm 1 nút). Không cần sửa code.

```
Notion (bạn sửa) ──► GitHub Actions (tự build mỗi 30') ──► GitHub Pages (website)
```

## Cài đặt (làm 1 lần, ~10 phút)

### 1. Tạo Notion Integration
1. Vào https://www.notion.so/profile/integrations → **New integration**.
2. Chọn workspace **leezignmotion**, loại **Internal**, đặt tên ví dụ `Portfolio Website`.
3. Ở tab *Capabilities* chỉ cần bật **Read content**.
4. Copy **Internal Integration Secret** (bắt đầu bằng `ntn_…`).

### 2. Cho integration quyền đọc trang portfolio
Mở trang *Motion Designer & Animation Director* trong Notion → `•••` (góc phải) → **Connections** → thêm `Portfolio Website`.
Mọi trang con và database bên trong sẽ tự được cấp quyền theo.

### 3. Tạo repo GitHub
1. Tạo repo mới (Public), ví dụ `portfolio`. Upload toàn bộ thư mục này lên (kéo thả trên web GitHub cũng được, nhớ có thư mục `.github`).
2. **Settings → Secrets and variables → Actions**:
   - Tab *Secrets* → **New repository secret**: tên `NOTION_TOKEN`, giá trị = secret ở bước 1.
   - Tab *Variables* → **New repository variable**: tên `NOTION_PAGE_ID`, giá trị = link trang Notion của bạn (dán nguyên link là được).
   - (Tuỳ chọn) biến `SITE_URL` = `https://<username>.github.io/portfolio` để ảnh preview hiện khi share link lên Facebook/LinkedIn.
3. **Settings → Pages → Source**: chọn **GitHub Actions**.
4. Tab **Actions** → chọn workflow *Đồng bộ Notion → GitHub Pages* → **Run workflow**.

Vài phút sau website có tại `https://<username>.github.io/portfolio/`.

## Dùng hằng ngày
- Thêm/sửa project, GIF, video, ảnh, mô tả trong Notion → tối đa 30 phút sau website tự cập nhật.
- Muốn cập nhật **ngay**: GitHub → Actions → *Run workflow* (làm được cả trên app GitHub điện thoại).

## Cấu trúc Notion hiện tại

```
Home (trang chính)
├─ Thanh menu (synced block): Home · Work · About me · Contact   ← dùng lại ở mọi trang
├─ About Me + hàng nút danh mục: Branding · Motion Graphics · Explainer · Commercial · Personal Project
├─ Mỗi danh mục: 3 dự án nổi bật (cột FEATURED) + nút "View all … →"
├─ Making of
└─ Footer ©
Work → toàn bộ dự án, nhóm theo TAGS (database gốc "The Portfolio" nằm ở đây)
   └─ 5 trang danh mục, mỗi trang lọc 1 TAGS
```

- **Thêm dự án mới:** vào Work → gallery → **New**. Chọn TAGS (danh mục). Muốn hiện ở trang chính thì tick **FEATURED**.
- **Thêm danh mục mới:** thêm lựa chọn trong cột TAGS. Nếu muốn có trang riêng và khu xem trước ở Home thì nhân bản một trang danh mục rồi đổi bộ lọc.
- Website đọc gallery **đúng theo view trong Notion** (bộ lọc, thứ tự kéo thả, nhóm). Sắp xếp trong Notion thế nào, web hiện thế ấy. Nút Previous/Next trên web tự tính theo thứ tự ở trang Work.

## Đổi màu từng trang

- **Trang thường** (Home, Work, About me, Articles, các trang danh mục): dòng cuối trang `🎨 Theme: #nền / #nhấn`, ví dụ `🎨 Theme: #0B1220 / #5AA2FF`. Thêm mã thứ 3 nếu muốn tự chọn màu chữ.
- **Trang dự án / bài viết:** điền ô **BG COLOR** và **ACCENT COLOR** trong database. Để trống thì tự lấy màu của danh mục (tag đầu tiên), rồi tới màu trang chủ.
- Website tự tính màu chữ, nền khối và đường kẻ cho dễ đọc (nền sáng → chữ tối, nền tối → chữ sáng). Dòng Theme không hiện ra ngoài web.

## Website hiểu Notion thế nào

| Trong Notion | Trên website |
|---|---|
| Trang gốc | Trang chủ (tiêu đề, ảnh cover, nội dung) |
| Database (gallery/table) đặt trong trang | Lưới project có thumbnail, tag |
| Mỗi dòng/trang trong database | Trang project riêng, có nút Trước/Tiếp |
| Trang con thường | Trang riêng (ví dụ "Về tôi") |
| Ảnh, GIF | Ảnh |
| Video upload lên Notion (.mp4/.mov/.webm) | Video tự chạy không tiếng khi cuộn tới, có nút bật tiếng |
| Video link YouTube / Vimeo / Loom | Trình phát nhúng |
| Columns, toggle, callout, quote, bảng, bookmark, code | Giữ nguyên bố cục |
| Thuộc tính (Client, Year, Role, Tags…) | Dòng thông tin ở đầu trang project |

**Thumbnail project** lấy theo thứ tự: ảnh cover của trang → cột kiểu *Files & media* đầu tiên (đặt GIF/MP4 vào đây để thumbnail chuyển động) → ảnh/video đầu tiên trong trang.

**Cột đặc biệt (không bắt buộc, thêm vào database nếu cần):**
- `Order` (Number): sắp xếp thứ tự project, số nhỏ lên trước. Không có thì xếp theo cột ngày (mới nhất trước), rồi theo ngày tạo.
- `Published` (Checkbox): chỉ project được tick mới hiện. Hoặc dùng `Hidden` / `Ẩn` (Checkbox) để giấu project.
- Các cột này không hiển thị ra website.

## Lưu ý
- **Linked database** (database “liên kết” — tạo bằng `/linked view`) không đọc được qua Notion API. Hãy đặt database gốc trong trang, hoặc thêm trang chứa database gốc vào Connections.
- File upload lên Notion có link hết hạn sau 1 giờ, nên script tải về và lưu trên website. Video nặng: GitHub Pages giới hạn site khoảng 1 GB, nên với video dài hãy upload lên Vimeo/YouTube rồi dán link vào Notion.
- Lịch 30 phút có thể trễ thêm vài phút khi GitHub đông. Muốn thưa hơn, sửa dòng `cron` trong `.github/workflows/deploy.yml`.
- Đổi màu/font: sửa các biến ở đầu `site/style.css` (ví dụ `--accent`). Website tự có giao diện sáng/tối theo thiết bị người xem.
- Tên miền riêng: Settings → Pages → Custom domain.

## Chạy thử trên máy (tuỳ chọn)
```bash
npm install
NOTION_TOKEN=ntn_xxx NOTION_PAGE_ID="<link trang>" npm run build
npm run preview
```

## Hero trang chủ & hàng xem trước
- **Ảnh chân dung ở hero:** ảnh đầu tiên đặt trong trang chủ Notion (phía trên hàng nút danh mục) sẽ hiện bên phải tiêu đề lớn. Thay ảnh trong Notion là web đổi theo. Khi có ảnh này, ảnh cover của trang chủ không hiện trên web.
- **Màu chính:** dòng `🎨 Theme: nền / nhấn / chữ` cuối trang chủ, ví dụ `🎨 Theme: #EEEAE4 / #E3411D / #E3411D`.
- **Xem trước mỗi danh mục:** web hiện đúng 1 hàng, lấp đầy bằng dự án FEATURED trước rồi tới các dự án khác cùng danh mục; thẻ tràn hàng được ẩn, xem đủ ở "View all".
- **Video Dropbox:** dán link chia sẻ Dropbox (…dl=0) như bình thường, web tự đổi sang link phát trực tiếp.

## Video tổng & link trên ảnh
- **Video tổng:** tạo một callout trong Notion, dán link video vào (Dropbox, Vimeo, YouTube, Loom hoặc file .mp4). Dán dạng link hay dạng xem trước (link preview/embed) đều được. Web sẽ hiện thẳng video, không hiện khung callout.
- **Ảnh có link:** Notion API không đọc được link gắn trực tiếp lên ảnh. Hãy dán link vào **chú thích (caption)** của ảnh:
  - link video (Dropbox/Vimeo/YouTube…) → web hiện video đó, ảnh làm hình chờ;
  - link khác (bài báo, Behance…) → bấm vào ảnh sẽ mở link.

## SEO, nút liên hệ, thống kê lượt xem
- **Mô tả trang (Google/Facebook):** trang chủ dùng dòng giới thiệu; trang dự án dùng cột **Summary** nếu có, không thì đoạn văn đầu tiên. Ảnh xem trước = ảnh chân dung (trang chủ) / thumbnail dự án.
- **Sitemap:** `sitemap.xml` và `robots.txt` tự tạo mỗi lần build (theo `SITE_URL`, mặc định là địa chỉ GitHub Pages).
- **Khu "Let's work together":** trong trang chủ Notion, tiêu đề có cụm *Let's work together* (hoặc *Get in touch*, *Let's talk*) + các dòng bên dưới sẽ thành khu liên hệ lớn; link `mailto:` thành nút đặc.
- **Đếm lượt xem:** thêm 1 dòng cuối trang chủ Notion: `📊 Analytics: <mã>` — mã GoatCounter (VD `leezign`) hoặc token 32 ký tự của Cloudflare Web Analytics. Dòng này không hiện trên web.

## Cảnh quả địa cầu (About me)
Một dòng chữ bắt đầu bằng 🌏 trong Notion, ví dụ `🌏 Based in Ho Chi Minh City, Viet Nam`, sẽ thành cảnh ghim màn hình khi cuộn: quả địa cầu bằng chữ số 0/1 phóng to 2 nấc → xoay tới Việt Nam → bản đồ Việt Nam phóng to → chữ "VIỆT NAM", kèm dòng chữ phía sau 🌏 làm chú thích. Kéo dòng này lên/xuống trong Notion để đổi vị trí.

## Câu tuyên ngôn pixel (About me)
Trong mục có tiêu đề (VD "Hello 👋"), một khối **Quote** sẽ thành câu chữ cỡ lớn:
- Chữ đặt trong `code` (Ctrl+E trong Notion) → hiện bằng font pixel.
- Emoji → biểu tượng pixel: ❤ tim · 🙂 mặt cười · ● pac-man · ✦ ngôi sao · ▶ nút phát · ▬ thanh khối đặc (nhiều ▬ = thanh dài hơn).
- Các dòng gạch đầu dòng dạng `Nhãn: nội dung` bên dưới thành các chú thích nhỏ có vạch dọc.
- Các đoạn văn còn lại của mục hiện bằng chữ mono ở cột phải.

## Dòng trạng thái giữa thanh menu
Thêm 1 dòng cuối trang chủ Notion: `📣 Available for freelance & directing` → hiện giữa thanh menu (kèm tim pixel nhịp đập) trên mọi trang; trên điện thoại hiện ở đầu trang chủ. Xoá dòng này để ẩn.
