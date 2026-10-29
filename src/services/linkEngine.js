// ─── FotoYönetim Link & QR Attribution Engine ──────────────────
// Resolves clean paths (/ayse-mehmet/gelin), query params (?ref=damat&by=Emre&to=Ahmet&st=sl-123),
// and hash URLs (#/ayse-mehmet?ref=gelin). Tracks who shared what, to whom, and when.

const ATTRIBUTION_KEY = 'fy_active_attribution_v1';

const RESERVED_PATHS = new Set([
  '', 'index.html', 'app.js', 'style.css', 'health', 'api', 'src', 'assets', 'static', 'storage', 'favicon.ico'
]);

export const LinkEngine = {
  // Parse current browser location (pathname + search + hash) into a unified attribution descriptor
  parseCurrentLocation(loc = window.location) {
    const searchParams = new URLSearchParams(loc.search || '');
    let code = searchParams.get('dugun') || searchParams.get('etkinlik') || searchParams.get('code') || searchParams.get('wedding') || '';
    let role = searchParams.get('role') || '';
    let ref = searchParams.get('ref') || searchParams.get('from') || '';
    let sharedBy = searchParams.get('by') || searchParams.get('kimden') || '';
    let sharedTo = searchParams.get('to') || searchParams.get('kime') || '';
    let shareType = searchParams.get('via') || searchParams.get('type') || '';
    let shareTokenId = searchParams.get('st') || searchParams.get('token') || '';

    // 1. Parse clean pathname (e.g. /ayse-mehmet or /ayse-mehmet/yonetim or /ayse-mehmet/gelin)
    if (loc.pathname && loc.protocol !== 'file:') {
      const segments = loc.pathname.split('/').map(s => s.trim()).filter(Boolean);
      const firstSeg = segments.length > 0 ? segments[0].toLowerCase() : '';
      const isStaticOrLocalPath =
        RESERVED_PATHS.has(firstSeg) ||
        firstSeg.endsWith('.html') ||
        firstSeg.endsWith('.js') ||
        firstSeg.endsWith('.css') ||
        firstSeg.includes(':');
      if (segments.length === 1 && !isStaticOrLocalPath) {
        if (!code) code = decodeURIComponent(segments[0]);
      } else if (segments.length === 2 && !isStaticOrLocalPath) {
        const sub = segments[1].toLowerCase();
        const isKnownSub = ['yonetim', 'owner', 'admin', 'gelin', 'damat', 'masa-qr', 'qr', 'fotografci'].includes(sub);
        if (isKnownSub) {
          if (!code) code = decodeURIComponent(segments[0]);
          if (sub === 'yonetim' || sub === 'owner' || sub === 'admin') {
            role = 'owner';
          } else {
            if (!ref) ref = sub === 'qr' ? 'masa-qr' : sub;
          }
        }
      }
    }

    // 2. Parse hash route (e.g. #/ayse-mehmet?ref=gelin&by=Emre&to=Can&st=sl-1234)
    if (loc.hash) {
      const rawHash = loc.hash.replace(/^#\/?/, '').trim();
      let hashPath = rawHash;
      let hashQuery = '';
      if (rawHash.includes('?')) {
        const qIdx = rawHash.indexOf('?');
        hashPath = rawHash.slice(0, qIdx);
        hashQuery = rawHash.slice(qIdx + 1);
      }
      const hashParams = new URLSearchParams(hashQuery);
      if (!ref) ref = hashParams.get('ref') || hashParams.get('from') || '';
      if (!sharedBy) sharedBy = hashParams.get('by') || hashParams.get('kimden') || '';
      if (!sharedTo) sharedTo = hashParams.get('to') || hashParams.get('kime') || '';
      if (!shareType) shareType = hashParams.get('via') || hashParams.get('type') || '';
      if (!shareTokenId) shareTokenId = hashParams.get('st') || hashParams.get('token') || '';
      if (!role && hashParams.get('role')) role = hashParams.get('role');

      const hashSegments = hashPath.split('/').map(s => s.trim()).filter(Boolean);
      if (hashSegments.length > 0 && !hashSegments[0].includes('=')) {
        if (!code) code = decodeURIComponent(hashSegments[0]);
        if (hashSegments.length > 1) {
          const sub = hashSegments[1].toLowerCase();
          if (sub === 'yonetim' || sub === 'owner' || sub === 'admin') {
            role = 'owner';
          } else if (sub === 'gelin' || sub === 'damat' || sub === 'masa-qr' || sub === 'qr' || sub === 'fotografci') {
            if (!ref) ref = sub === 'qr' ? 'masa-qr' : sub;
          }
        }
      }
    }

    if (ref === 'qr') ref = 'masa-qr';
    if (!shareType) {
      shareType = ref === 'masa-qr' ? 'qr' : 'link';
    }

    const parsed = {
      code: code.trim(),
      role: role.trim(),
      ref: ref.trim(),
      sharedBy: sharedBy.trim(),
      sharedTo: sharedTo.trim(),
      shareType: shareType.trim(),
      shareTokenId: shareTokenId.trim()
    };

    // Persist attribution in sessionStorage if present so page reloads never lose who gave the link
    if (parsed.code || parsed.ref || parsed.sharedBy || parsed.shareTokenId) {
      this.saveAttribution(parsed);
      return parsed;
    }

    return this.getSavedAttribution() || parsed;
  },

  saveAttribution(data) {
    try {
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({
        ...data,
        capturedAt: new Date().toLocaleString('tr-TR')
      }));
    } catch (e) {}
  },

  getSavedAttribution() {
    try {
      const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  clearAttribution() {
    try {
      sessionStorage.removeItem(ATTRIBUTION_KEY);
    } catch (e) {}
  },

  // Build a tracked invitation or manager URL with full attribution metadata
  buildTrackedUrl({ weddingCode, channel = 'direkt', shareType = 'link', sharedBy = '', sharedTo = '', shareTokenId = '' }) {
    const base = window.location.origin + window.location.pathname.replace(/\/+$/, '');
    const code = encodeURIComponent(weddingCode || 'dugun');
    const params = new URLSearchParams();

    if (channel && channel !== 'owner') {
      params.set('ref', channel);
    }
    if (shareType) {
      params.set('via', shareType);
    }
    if (sharedBy && sharedBy.trim()) {
      params.set('by', sharedBy.trim());
    }
    if (sharedTo && sharedTo.trim()) {
      params.set('to', sharedTo.trim());
    }
    if (shareTokenId && shareTokenId.trim()) {
      params.set('st', shareTokenId.trim());
    }

    const pathPart = channel === 'owner' ? `#/${code}/yonetim` : `#/${code}`;
    const queryStr = params.toString();
    return queryStr ? `${base}/${pathPart}?${queryStr}` : `${base}/${pathPart}`;
  },

  // Deterministic SVG QR Matrix generator (zero external dependencies, renders scannable-style visual matrix)
  generateQrSvg(url, label = '') {
    let hash = 2166136261;
    for (let i = 0; i < url.length; i++) {
      hash ^= url.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const size = 21;
    const cell = 8;
    const pad = 16;
    const total = size * cell + pad * 2;
    let rects = '';

    const isFinder = (r, c) => {
      const inTL = r < 7 && c < 7;
      const inTR = r < 7 && c >= size - 7;
      const inBL = r >= size - 7 && c < 7;
      return inTL || inTR || inBL;
    };

    const drawFinder = (r0, c0) => {
      const x = pad + c0 * cell;
      const y = pad + r0 * cell;
      rects += `<rect x="${x}" y="${y}" width="${7 * cell}" height="${7 * cell}" fill="none" stroke="#1a1a1a" stroke-width="${cell}"/>`;
      rects += `<rect x="${x + 2 * cell}" y="${y + 2 * cell}" width="${3 * cell}" height="${3 * cell}" fill="#1a1a1a"/>`;
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    let seed = Math.abs(hash) || 123456789;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (isFinder(r, c)) continue;
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const bit = ((seed ^ (r * 31 + c * 17)) & 3) !== 0;
        if (bit) {
          rects += `<rect x="${pad + c * cell}" y="${pad + r * cell}" width="${cell - 0.5}" height="${cell - 0.5}" fill="#1a1a1a" rx="1"/>`;
        }
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total + (label ? 22 : 0)}" width="200" height="${label ? 222 : 200}">
      <rect width="100%" height="100%" fill="#ffffff" rx="4"/>
      ${rects}
      ${label ? `<text x="${total / 2}" y="${total + 14}" font-family="Georgia, serif" font-size="10" fill="#8a8a8a" text-anchor="middle">${label}</text>` : ''}
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
};

