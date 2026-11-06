// Cảnh quả địa cầu bằng chữ số 0/1 (trang About): cuộn → phóng to 2 nấc → xoay tới Việt Nam → bản đồ Việt Nam phóng to → chữ "VIỆT NAM"
(() => {
  const scenes = document.querySelectorAll('.globe-scene');
  if (!scenes.length) return;
  const dec = (b64, k) => {
    const bin = atob(b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const a = new Int16Array(u8.buffer); const out = [];
    for (let i = 0; i < a.length; i += 2) out.push([a[i] / k, a[i + 1] / k]);
    return out;
  };
  const LAND = dec('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FwGkAxcBUwAWAWACFQFtBBUBvPsVARsBFAEoAxMB1/8TAeQBEgHxAxEBnwARAawCEAEJ/A8BaAEPAXUDDgEjAA4B0fwNATACDQE+BAwB7AALAfkCCwGn/woBtAEJAcIDCQFwAAgBfQIHAYoEBwHZ+wcBOAEGAUYDBgH0/wUBAQIEAQ4EBAG8AAMBygIDAXj/AgEm/AIBhQEBAZIDAQFAAAABTgL/AFsE/wAJAf4AFgP9AMT//QDSAfwA3wP7AI0A+gD3+/kAVgH5AGMD+AARAPcALAT2ANoA9gDnAvUAlf/0AKIB9ACwA/MAXgDyAHgE8QAmAfEANAPwAOL/7wDvAe8A/APuAKoA7QC4Au0AZv/sABT86wCAA+sALgDqADwC6gBJBOkA9wDoAAQD6ACy/+cAwAHmAM0D5gB7AOQA5fvkAEQB4wBRA+MA///iAAwC4QAZBOEAyADgANUC4ACD/98AkAHeAJ0D3gBMANwAZgTcABQB2wAhA9sA0P/aAN0B2QDqA9kAmADXAAL81wBhAdYAHADVACkC1ADlANMA8gLTAKD/0gCuAdEAuwPRAGkAzwAyAc4APwPOAO3/zQCb/M0A+gHMAAcEzAC2AMsAcf/KAB/8yQA6AMcAVATHAAIBxgAPA8YAvv/FAMsBxADYA8QAhgDDADT9wgDw+8IATwHBAAoAwAAXAr8A0wC+AOACvgCO/70APPy8AKkDvABXALoAHwG5AC0DuQDb/7gAify4AOgBuAD1A7cAowC3AFL9tgC+BLUADfy1AGwBtAAnALIA8ACyAP0CsQCr/7EAWvywALkBsADGA68AdACtAD0BrAD4/6sABQKrABMEqgDBAKkAfP+pACr8pwBFAKYADQGlABsDpADJ/6QAd/ykANYBowDjA6MAkQChAFoBoAAVAJ4AMASeAN4AnQDrAp0Amf+bAGIAmQArAZgA5v+XAJT8lwDzAZYAAASWAK8AlQBq/5QAdwGTADMAkQD7AJAACAOQALf/jwDEAY4AfwCMAEgBiwADAIsAsfyKAB4EiQDMAIgAh/+IAJUBhwCiA4YAUACFABkBhADU/4IAnQCAAGUBfwAhAH0AOwR9AOkAfAD2AnwApf96AG0AeAA2AXcA8f93AJ/8dgD+AXYADAR1ALoAdAB1/3QAggFyAD4AcQAGAXAAFANvAML/bgDcA24AigBtADn9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', 10), VN = dec('aAMCKWgDEil4A/IoeAMCKXgDEil4AyIpiAPyKIgDAimIAxIpiAMiKZgD8iiYAwIpmAMSKZgDIimYAzIpmANCKagDAimoAxIpqAMiKagDMimoA0IpqANSKagDYim4AwIpuAMSKbgDIim4AzIpuANCKbgDUim4A2IpuANyKcgDAinIAxIpyAMiKcgDMinIA0IpyANSKcgDYinIA3IpyAOCKcgDkinYAwIp2AMSKdgDIinYAzIp2ANCKdgDUinYA2Ip2ANyKdgDginYA5Ip6AMSKegDIinoAzIp6ANCKegDUinoA2Ip6ANyKegDginoA5Ip6AOiKfgDoij4AwIp+AMSKfgDIin4AzIp+ANCKfgDUin4A2Ip+ANyKfgDgin4A5Ip+AOiKfgDsikIBKIoCATiKAgE8igIBAIpCAQSKQgEIikIBDIpCARCKQgEUikIBGIpCARyKQgEgikIBJIpCASiKQgEsikYBOIoGATyKBgEAikYBBIpGAQiKRgEMikYBEIpGARSKRgEYikYBHIpGASCKRgEkikYBKIpGATCKRgE4ikYBPIpKAQCKSgEEikoBCIpKAQyKSgEQikoBFIpKARiKSgEcikoBIIpKASSKSgEoikoBLIpKATCKSgE0ikoBOIpKATyKSgEAiooBBIqOAQSKTgEIik4BDIpOARCKTgEUik4BGIpOASCKTgEkik4BKIpOASyKTgEwik4BNIpOATiKTgE8ik4BAIqOAQSKjgEIio4BDIqSARCKUgEUilIBIIpSASSKUgEoilIBLIpSATCKUgE0ilIBOIpSATyKUgEAipIBBIqSAQiKkgEMipIBEIqWARyKVgEgilYBJIpWASiKVgEsilYBMIpWATSKVgE4ilYBPIpWAQCKlgEEipYBCIqWAQyKlgEQipYBFIqWARiKmgEYiloBHIpaASCKWgEkiloBKIpaASyKWgEwiloBNIpaATiKWgE8iloBAIqaAQSKmgEIipoBDIqaARCKmgEUipoBGIqaARyKngEYil4BHIpeASCKXgEkil4BKIpeASyKXgEwil4BNIpeATiKXgE8il4BAIqeAQSKngEIip4BDIqeARCKngEUip4BGIqeARyKngEgip4BJIqiARiKYgEcimIBIIpiASSKYgEoimIBLIpiATCKYgE0imIBOIpiATyKYgEAiqIBBIqiAQiKogEMiqIBEIqiARSKogEYiqIBHIqiASCKogEkiqYBJIpmASiKZgEsimYBMIpmATSKZgE4imYBPIpmAQCKpgEEiqYBCIqmAQyKpgEQiqYBFIqmARiKpgEciqYBIIqmASSKpgEoiqoBJIpqASiKagEsimoBMIpqATSKagE4imoBPIpqAQCKqgEEiqoBCIqqAQyKqgEQiqoBFIqqARiKqgEciqoBIIqqASSKqgEoiq4BNIpuATiKbgE8im4BAIquAQSKrgEIiq4BDIquARCKrgEUiq4BGIquARyKrgEgiq4BJIquASiKsgE4inIBPIpyAQCKsgEEirIBCIqyAQyKsgEQirIBFIqyARiKsgEcirIBIIqyASSKsgEoirYBAIq2AQSKtgEIirYBDIq2ARCKtgEUirYBGIq2ARyKtgEgirYBJIq2ASiKtgEsiroBBIq6AQiKugEMiroBEIq6ARSKugEYiroBHIq6ASCKugEkiroBKIq+AQCKvgEEir4BCIq+AQyKvgEQir4BFIq+ARiKvgEcir4BIIq+ASSKvgEoioIBQIqCAUSKggFIioIBTIqCAVCKggFUioIBWIqCAVyKggFgioIBZIqCAWiKggFsioYBQIqGAUSKhgFIioYBTIqGAVCKhgFUioYBWIqGAVyKhgFgioYBZIqGAWiKhgFsiooBQIqKAUSKigFIiooBTIqKAVCKigFUiooBWIqKAVyKigFgiooBZIqKAWiKigFsio4BRIqOAUiKjgFMio4BUIqOAVSKjgFYio4BXIqOAWCKjgFkio4BaIqSAUSKkgFIipIBTIqSAVCKkgFUipIBWIqSAVyKkgFgipIBZIqSAWiKlgFAipYBRIqWAUiKlgFMipYBUIqWAVSKlgFYipYBXIqWAWCKlgFkipYBaIqaAUCKmgFEipoBSIqaAUyKmgFQipoBVIqaAViKmgFcipoBYIqaAWSKmgFoip4BQIqeAUSKngFIip4BTIqeAVCKngFUip4BWIqeAVyKngFgip4BZIqeAWiKogF8imIBQIqiAUSKogFIiqIBTIqiAVCKogFUiqIBWIqiAVyKogFgiqIBZIqiAWiKpgF8imYBQIqmAUSKpgFIiqYBTIqmAVCKpgFUiqYBWIqmAVyKpgFgiqYBZIqmAWiKqgFAiqoBRIqqAUiKqgFMiqoBUIqqAVSKqgFYiqoBXIqqAWCKqgFkiq4BQIquAUSKrgFIiq4BTIquAVCKrgFUiq4BWIquAVyKrgFgiq4BZIqyAUCKsgFEirIBSIqyAUyKsgFQirIBVIqyAViKsgFcirIBYIqyAWSKtgFAirYBRIq2AUiKtgFMirYBUIq2AVSKtgFYirYBXIq2AWCKugFEiroBSIq6AUyKugFQiroBVIq6AViKugFciroBYIq+AUSKvgFIir4BTIq+AVCKvgFUir4BWIq+AVyKvgFgioIBgIqCAYSKggGIioIBjIqCAZCKggGUioIBmIqCAZyKhgG8ikYBgIqGAYSKhgGIioYBjIqGAZCKhgGUioYBmIqKAbiKSgG8ikoBgIqKAYSKigGIiooBjIqKAZCKigGUio4BvIpOAYCKjgGEio4BiIqOAYyKjgGQio4BlIqSAbyKUgGAipIBhIqSAYiKkgGMipIBkIqWAbiKVgG8ilYBgIqWAYSKlgGIipYBjIqaAbCKWgG0iloBuIpaAbyKWgGAipoBhIqeAayKXgGwil4BtIpeAbiKXgG8il4BgIqiAaiKYgGsimIBsIpiAbSKYgG4imIBvIpmAaiKZgGsimYBsIpmAbSKagGkimoBqIpqAayKagGwimoBtIpuAaSKbgGoim4BrIpuAbCKcgGcinIBoIpyAaSKcgGoinIBrIp2AZiKdgGcinYBoIp2AaSKdgGoinoBlIp6AZiKegGcinoBoIp6AaSKfgGUin4BmIp+AZyKfgGgin4BpIpCAdCKQgHUikIB2IpCAdyKQgHgikIB5IpGAcyKRgHQikYB1IpGAdiKRgHcikYB4IpKAciKSgHMikoB0IpKAdSKSgHYik4BxIpOAciKTgHMik4B0IpOAdSKUgHIilIBzIpSAdCKUgHUilYB/IoWAcCKVgHEilYByIpWAcyKVgHQiloB9IoaAfiKGgH8ihoBwIpaAcSKWgHIiloBzIpaAdCKXgHwih4B9IoeAfiKHgH8ih4BwIpeAcSKXgHIil4BzIpeAdCKYgHoiiIB7IoiAfCKIgH0iiIB+IoiAfyKIgHAimIBxIpiAciKYgHMimIB0IpiAdSKZgHsiiYB8IomAfSKJgH4iiYB/IomAcCKZgHEimYByIpmAcyKZgHQimYB1IpqAeyKKgHwiioB9IoqAfiKKgH8iioBwIpqAcSKagHIimoBzIpqAdCKagHUim4B/IouAcCKbgHEim4ByIpuAcyKbgHQim4B1IpyAcCKcgHEinIByIpyAcyKcgHQinIB1IpyAdiKdgHAinYBxIp2AciKdgHMinYB0Ip2AdSKdgHYinYB3Ip2AeCKegH8ijoBwIp6AcSKegHIinoBzIp6AdCKegHUinoB2Ip6AdyKegHginoB5Ip+AfiKPgH8ij4BwIp+AcSKfgHIin4BzIp+AdCKfgHUin4B2Ip+AdyKfgHgin4B5IpCAjiKAgI8igICAIpCAgSKQgIIikICDIpCAhCKQgIUikICGIpCAhyKQgIgikICJIpCAiiKRgIgigYCNIoGAjiKBgI8igYCAIpGAgSKRgIIikYCDIpGAhCKRgIUikYCGIpGAhyKRgIgikYCJIpGAiiKSgIUigoCGIoKAhyKCgIgigoCJIoKAjCKCgI0igoCOIoKAjyKCgIAikoCBIpKAgiKSgIMikoCEIpKAhSKSgIYikoCHIpKAiCKSgIkikoCKIpOAhCKDgIUig4CGIoOAhyKDgIgig4CJIoOAiiKDgIsig4CMIoOAjSKDgI4ig4CPIoOAgCKTgIEik4CCIpOAgyKTgIQik4CFIpOAhiKTgIcik4CIIpOAiSKTgIoik4CLIpOAjCKTgI0ik4COIpSAgyKEgIQihICFIoSAhiKEgIcihICIIoSAiSKEgIoihICLIoSAjCKEgI0ihICOIoSAjyKEgIAilICBIpSAgiKUgIMilICEIpSAhSKUgIYilICHIpSAiCKUgIkilICKIpSAiyKUgIwilICNIpSAjiKUgIAipYCDIoWAhCKFgIUihYCGIoWAhyKFgIgihYCJIoWAiiKFgIsihYCMIoWAjSKFgI4ihYCPIoWAgCKVgIEilYCCIpWAgyKVgIQilYCFIpWAhiKVgIcilYCIIpWAiSKVgIoilYCLIpWAjCKVgI0ilYCOIpWAjyKVgIAipoCEIoaAhSKGgIYihoCHIoaAiCKGgIkihoCKIoaAiyKGgIwihoCNIoaAjiKGgI8ihoCAIpaAgSKWgIIiloCDIpaAhCKWgIUiloCGIpaAhyKWgIgiloCJIpaAiiKWgIsiloCMIpaAjSKWgI4iloCPIpaAgCKmgIEipoCCIqeAgiKHgIQih4CFIoeAhiKHgIcih4CIIoeAiSKHgIoih4CLIoeAjCKHgI0ih4COIoeAjyKHgIAil4CBIpeAgiKXgIMil4CEIpeAhSKXgIYil4CHIpeAiCKXgIkil4CKIpeAiyKXgIwil4CNIpeAjiKYgIIiiICDIoiAhCKIgIUiiICGIoiAhyKIgIgiiICJIoiAiiKIgIsiiICMIoiAjSKIgI4iiICPIoiAgCKYgIEimICCIpiAgyKYgIQimICFIpiAhiKYgIcimICIIpiAiSKYgIoimICLIpiAjCKZgIEiiYCCIomAgyKJgIQiiYCFIomAhiKJgIciiYCIIomAiSKJgIoiiYCLIomAjCKJgI0iiYCOIomAjyKJgIAimYCBIpmAgiKZgIMimYCEIpmAhSKZgIYimYCHIpmAiCKZgIkimYCKIpqAgCKKgIEiioCCIoqAgyKKgIQiioCFIoqAhiKKgIciioCIIoqAiSKKgIoiioCLIoqAjCKKgI0iioCOIoqAjyKKgIAimoCBIpqAgiKagIMimoCEIpqAhSKagIYimoCHIpqAiCKagIkimoCKIpuAjyJ7gIAii4CBIouAgiKLgIMii4CEIouAhSKLgIYii4CHIouAiCKLgIkii4CKIouAiyKLgIwii4CNIouAjiKLgI8ii4CAIpuAgSKbgIIim4CDIpuAhCKbgIUim4CGIpuAhyKbgIgim4CJIpuAiiKcgI8ifICAIoyAgSKMgIIijICDIoyAhCKMgIUijICGIoyAhyKMgIgijICJIoyAiiKMgIsijICMIoyAjSKMgI4ijICPIoyAgCKcgIEinICCIpyAgyKcgIQinICFIpyAhiKcgIcinICIIpyAiSKdgIAijYCBIo2AhSKNgIYijYCHIo2AiCKNgIoijYCLIo2AjCKNgI0ijYCOIo2AjyKNgIAinYCBIp2AgiKdgIMinYCEIp2AhSKdgIYinYCHIp2AiCKdgIkinYCKIp6AiyKOgI4ijoCPIo6AgCKegIEinoCCIp6AgyKegIQinoCFIp6AhiKegIcinoCIIp6AiSKegIoinoCLIp+AjyKPgIAin4CBIp+AgiKfgIMin4CEIp+AhSKfgIcikICQIpCAkSKQgJIikICTIpGAkiKQ==', 100);
  const VN_COARSE = VN.filter((_, i) => i % 7 === 0);
  const RAD = Math.PI / 180, TARGET = { lat: 15.5, lon: 106.5 };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const seg = (p, a, b) => smooth(clamp((p - a) / (b - a)));
  const mix = (a, b, t) => a + (b - a) * t;
  const FONT = '"Bricolage Grotesque", system-ui, sans-serif';

  scenes.forEach((scene) => {
    const canvas = scene.querySelector('canvas'), ctx = canvas.getContext('2d');
    const cap = scene.querySelector('.globe-caption');
    let W = 0, H = 0, DPR = 1, color = '#E3411D', sprites = {}, textPts = [], textStep = 8;
    const bits = new Uint8Array(4000).map(() => (Math.random() < 0.5 ? 1 : 0));
    const sprite = (ch) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = color; g.font = '600 52px ui-monospace, Menlo, Consolas, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 34); return c;
    };
    const buildText = () => {
      // lấy toạ độ các điểm tạo thành chữ "VIỆT NAM"
      const w = Math.max(10, Math.round(W * 0.88)), h = Math.max(10, Math.round(H * 0.5));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); let fs = h * 0.62;
      const setF = () => { g.font = '800 ' + fs + 'px ' + FONT; };
      setF(); while (g.measureText('VIỆT NAM').width > w * 0.98 && fs > 10) { fs *= 0.95; setF(); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText('VIỆT NAM', w / 2, h * 0.56);
      const data = g.getImageData(0, 0, w, h).data;
      textStep = Math.max(6, Math.round(Math.min(W, H) / 95));
      const pts = [];
      for (let y = 0; y < h; y += textStep) for (let x = 0; x < w; x += textStep) if (data[(y * w + x) * 4 + 3] > 128) pts.push([x - w / 2, y - h / 2]);
      // xáo trộn để các chữ số bay tới chữ đều khắp
      for (let i = pts.length - 1; i > 0; i--) { const j = (i * 7919) % (i + 1); [pts[i], pts[j]] = [pts[j], pts[i]]; }
      textPts = pts;
    };
    const resize = () => {
      DPR = Math.min(2, devicePixelRatio || 1); W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      color = getComputedStyle(document.body).getPropertyValue('--accent').trim() || color;
      sprites = { 0: sprite('0'), 1: sprite('1') }; buildText();
    };
    resize(); addEventListener('resize', resize);
    if (document.fonts) document.fonts.ready.then(buildText);

    const project = (lat, lon, c, R, cx, cy) => {
      const p = lat * RAD, l = (lon - c.lon) * RAD, p0 = c.lat * RAD;
      const x = Math.cos(p) * Math.sin(l);
      const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
      const z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
      return [cx + R * x, cy - R * y, z];
    };
    const glyph = (b, x, y, s, a) => {
      if (a <= 0.01 || x < -s || y < -s || x > W + s || y > H + s) return;
      ctx.globalAlpha = Math.min(1, a); ctx.drawImage(sprites[b], x - s / 2, y - s / 2, s, s);
    };

    let pSm = -1, lastFlip = 0;
    const t0 = performance.now();
    const draw = (now) => {
      requestAnimationFrame(draw);
      const r = scene.getBoundingClientRect(), vh = innerHeight;
      if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) return;
      const pRaw = clamp(-r.top / Math.max(1, r.height - vh));
      pSm = pSm < 0 ? pRaw : pSm + (pRaw - pSm) * 0.09;
      const p = pSm, t = (now - t0) / 1000;
      if (now - lastFlip > 120) { for (let i = 0; i < 80; i++) bits[(Math.random() * bits.length) | 0] ^= 1; lastFlip = now; }
      ctx.clearRect(0, 0, W, H);
      const m = Math.min(W, H), cx = W / 2, cy = H / 2;

      // các nấc theo cuộn
      const z1 = seg(p, 0.05, 0.15), z2 = seg(p, 0.21, 0.31), turn = seg(p, 0.37, 0.52);
      const toMap = seg(p, 0.56, 0.68), mapZoom = seg(p, 0.68, 0.77), toText = seg(p, 0.81, 0.93);
      const R = m * (0.3 + 0.12 * z1 + 0.18 * z2 + 1.1 * turn);
      const autoLon = 20 + t * 8 + p * 140;
      const d = ((TARGET.lon - autoLon) % 360 + 540) % 360 - 180;
      const center = { lat: mix(12, TARGET.lat, turn), lon: autoLon + d * turn };
      const globeA = 1 - toMap;
      const s = clamp(R * 0.03, 6, 15);

      if (globeA > 0.01) {
        ctx.globalAlpha = 0.22 * globeA; ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < LAND.length; i++) {
          const [x, y, z] = project(LAND[i][0], LAND[i][1], center, R, cx, cy);
          const a = z > 0 ? 0.35 + 0.65 * z : 0.07 * (1 + z);
          glyph(bits[i % bits.length], x, y, s * (z > 0 ? 0.75 + 0.25 * z : 0.6), a * globeA * (1 - 0.6 * turn));
        }
      }
      const vnShow = seg(p, 0.40, 0.52);
      if (vnShow > 0.01) {
        const list = toMap > 0.02 ? VN : VN_COARSE;
        const mapH = H * mix(0.7, 0.96, mapZoom), k = mapH / 15.2, cosL = Math.cos(16 * RAD);
        const n = toText > 0 ? Math.max(list.length, textPts.length) : list.length;
        const sMap = clamp(k * 0.17, 5, 16), sText = clamp(textStep * 1.08, 5, 16);
        for (let i = 0; i < n; i++) {
          const [la, lo] = list[i % list.length];
          const [gx, gy, gz] = project(la, lo, center, R, cx, cy);
          const fx = cx + (lo - 106) * cosL * k, fy = cy - (la - 15.9) * k;
          const delay = ((i * 37) % 100) / 100 * 0.35;
          const tm = smooth(clamp((toMap - delay) / 0.65));
          let x = mix(gx, fx, tm), y = mix(gy, fy, tm);
          let size = mix(s * 1.15, sMap, tm);
          const a = (gz > 0 || tm > 0 ? 1 : 0.1) * vnShow;
          if (toText > 0 && textPts.length) {
            const tp = textPts[i % textPts.length];
            const tt = smooth(clamp((toText - delay * 0.8) / 0.72));
            x = mix(x, cx + tp[0], tt); y = mix(y, cy + tp[1], tt); size = mix(size, sText, tt);
          }
          glyph(bits[i % bits.length], x, y, size, a);
        }
      }
      ctx.globalAlpha = 1;
      if (cap) { const c = seg(p, 0.88, 0.97); cap.style.opacity = c; cap.style.transform = 'translateY(' + ((1 - c) * 24).toFixed(1) + 'px)'; }
    };
    requestAnimationFrame(draw);
  });
})();
