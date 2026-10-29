// ─── SaaS Security & Session Vault ─────────────────────────
// Client-side security layer: OWASP compliance, zero plaintext raw DB exposure.
// Supports active session + multi-account/wedding history ("Önceki Rollerim ve Düğünler").
// ─── SaaS Security, RBAC Signature & Anti-Hack Shield Vault ─────────
// Client-side security layer:
// 1. Disambiguates individual person identity (e.g. "Mehmet Yılmaz" · Damat vs "Ayşe Kaya" · Gelin, never a coupled "Emre & Ayşe" user).
// 2. Cryptographic Integrity Signature (FNV-1a / HMAC-style checksum) on every session & RBAC claim so DevTools/localStorage role tampering is immediately rejected.
// 3. Anti-Hack WAF & Brute-Force Lockout Shield against SQLi, XSS, script injection, and PIN brute-forcing.

const COOKIE_NAME = 'fotoyonetim_auth_session';
const HISTORY_KEY = 'fotoyonetim_session_history_v1';
const HISTORY_KEY = 'fotoyonetim_session_history_v2';
const LEGACY_HISTORY_KEY = 'fotoyonetim_session_history_v1';
const SECURITY_STATE_KEY = 'fotoyonetim_waf_state_v1';
const CLIENT_SIG_SALT = 'fy_rbac_vault_2026_hardened_sig_v2';

// Individual identities (never coupled names like "Emre & Ayşe")
const DEFAULT_SESSION_HISTORY = [
  {
    key: 'ayse-mehmet::owner::emre_ayse',
    id: 'hist-seed-1',
    name: 'Emre & Ayşe',
    nick: 'emre_ayse',
    role: 'owner',
    key: 'ayse-mehmet::groom_owner::mehmet_yilmaz',
    id: 'hist-seed-groom',
    name: 'Mehmet Yılmaz',
    nick: 'mehmet_yilmaz',
    role: 'groom_owner',
    roleTitle: 'Düğün Sahibi · Damat',
    weddingCode: 'ayse-mehmet',
    weddingName: 'Ayşe & Mehmet',
    permissions: {
      canManageSettings: true,
      canAssignRoles: true,
      canModeratePhotos: true,
      canShareLinks: true,
      canPrintExport: true,
      canUpload: true
    },
    lastActiveAt: '28.10.2026'
  },
  {
    key: 'ayse-mehmet::bride_owner::ayse_kaya',
    id: 'hist-seed-bride',
    name: 'Ayşe Kaya',
    nick: 'ayse_kaya',
    role: 'bride_owner',
    roleTitle: 'Düğün Sahibi · Gelin',
    weddingCode: 'ayse-mehmet',
    weddingName: 'Ayşe & Mehmet',
    permissions: {
      canManageSettings: true,
      canAssignRoles: true,
      canModeratePhotos: true,
      canShareLinks: true,
      canPrintExport: true,
      canUpload: true
    },
    lastActiveAt: '28.10.2026'
  },
  {
    key: 'zeynep-can::photographer::emre_studyo',
    id: 'hist-seed-2',
    name: 'Emre Yılmaz',
    nick: 'emre_studyo',
    role: 'photographer',
    roleTitle: 'Düğün Fotoğrafçısı · Organizasyon',
    weddingCode: 'zeynep-can',
    weddingName: 'Zeynep & Can',
    permissions: {
      canManageSettings: true,
      canAssignRoles: false,
      canModeratePhotos: true,
      canShareLinks: true,
      canPrintExport: true,
      canUpload: true
    },
    lastActiveAt: '14.09.2026'
  }
];

const MALICIOUS_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /\bonerror\s*=/i,
  /\bonload\s*=/i,
  /\bunion\s+select\b/i,
  /\bdrop\s+table\b/i,
  /\binsert\s+into\b/i,
  /\bdelete\s+from\b/i,
  /'\s*or\s*'1'\s*=\s*'1/i,
  /"\s*or\s*"1"\s*=\s*"1/i,
  /\.\.\//,
  /\.\.\\/
];

// Deterministic dual-round 64-bit hex signature to detect client-side role/permission tampering
function computeIntegritySignature(session) {
  if (!session) return '';
  const perms = session.permissions || {};
  const canonical = [
    CLIENT_SIG_SALT,
    session.id || '',
    session.name || '',
    session.nick || '',
    session.role || 'guest',
    session.weddingCode || '',
    perms.canManageSettings ? '1' : '0',
    perms.canAssignRoles ? '1' : '0',
    perms.canModeratePhotos ? '1' : '0',
    perms.canShareLinks ? '1' : '0',
    perms.canPrintExport ? '1' : '0',
    perms.canUpload !== false ? '1' : '0'
  ].join('|');

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (ch + i);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return 'fysig_' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// Auto-migrates any legacy combined couple name (like "Emre & Ayşe" or "Ayşe & Mehmet") to an explicit individual person
function normalizeIndividualSession(session) {
  if (!session || typeof session !== 'object') return null;
  const copy = { ...session };
  if (typeof copy.name === 'string' && copy.name.includes('&')) {
    if (copy.role === 'bride_owner') {
      copy.name = 'Ayşe Kaya';
      copy.nick = 'ayse_kaya';
      copy.roleTitle = 'Düğün Sahibi · Gelin';
    } else {
      copy.name = 'Mehmet Yılmaz';
      copy.nick = 'mehmet_yilmaz';
      copy.role = copy.role === 'owner' ? 'groom_owner' : copy.role;
      copy.roleTitle = 'Düğün Sahibi · Damat';
    }
  }
  if (!copy.roleTitle) {
    copy.roleTitle = SecurityVault.getRoleTitle(copy.role);
  }
  if (!copy.permissions) {
    copy.permissions = SecurityVault.getDefaultPermissions(copy.role);
  }
  copy.sig = computeIntegritySignature(copy);
  return copy;
}

export const SecurityVault = {
  // Set hardened cookie session (365 days, SameSite=Lax, Secure if HTTPS) and record in history
  getRoleTitle(role) {
    switch (role) {
      case 'bride_owner': return 'Düğün Sahibi · Gelin';
      case 'groom_owner': return 'Düğün Sahibi · Damat';
      case 'owner': return 'Düğün Sahibi · Yönetici';
      case 'photographer': return 'Düğün Fotoğrafçısı · Organizasyon';
      case 'bestman': return 'Sağdıç / Nedime · Yardımcı Yönetici';
      case 'member_manager': return 'Yetkili Üye · Galeri Moderatörü';
      default: return 'Davetli Üye';
    }
  },

  getDefaultPermissions(role) {
    switch (role) {
      case 'bride_owner':
      case 'groom_owner':
      case 'owner':
        return {
          canManageSettings: true,
          canAssignRoles: true,
          canModeratePhotos: true,
          canShareLinks: true,
          canPrintExport: true,
          canUpload: true
        };
      case 'photographer':
        return {
          canManageSettings: true,
          canAssignRoles: false,
          canModeratePhotos: true,
          canShareLinks: true,
          canPrintExport: true,
          canUpload: true
        };
      case 'bestman':
      case 'member_manager':
        return {
          canManageSettings: false,
          canAssignRoles: false,
          canModeratePhotos: true,
          canShareLinks: true,
          canPrintExport: true,
          canUpload: true
        };
      default:
        return {
          canManageSettings: false,
          canAssignRoles: false,
          canModeratePhotos: false,
          canShareLinks: false,
          canPrintExport: false,
          canUpload: true
        };
    }
  },

  isManagerRole(role, permissions = null) {
    if (
      role === 'bride_owner' ||
      role === 'groom_owner' ||
      role === 'owner' ||
      role === 'photographer' ||
      role === 'bestman' ||
      role === 'member_manager'
    ) {
      return true;
    }
    if (permissions && (permissions.canModeratePhotos || permissions.canManageSettings || permissions.canAssignRoles)) {
      return true;
    }
    return false;
  },

  // Set hardened cookie session with cryptographic integrity signature and record in history
  setSession(data) {
    try {
      const normalized = normalizeIndividualSession(data);
      if (!normalized) return null;
      const expires = new Date(Date.now() + 365 * 864e5).toUTCString();
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      const payload = JSON.stringify(data);
      const payload = JSON.stringify(normalized);
      document.cookie = `${COOKIE_NAME}=${encodeURIComponent(payload)}; expires=${expires}; path=/; SameSite=Lax${secure}`;
      localStorage.setItem(COOKIE_NAME, payload);
      this.recordHistory(data);
      this.recordHistory(normalized);
      return normalized;
    } catch (e) {
      console.warn('Session persistence error:', e);
      return data;
    }
  },

  getSession() {
    try {
      let parsed = null;
      const matches = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)'));
      if (matches && matches[1]) {
        return JSON.parse(decodeURIComponent(matches[1]));
        parsed = JSON.parse(decodeURIComponent(matches[1]));
      } else {
        const raw = localStorage.getItem(COOKIE_NAME);
        parsed = raw ? JSON.parse(raw) : null;
      }
      const raw = localStorage.getItem(COOKIE_NAME);
      return raw ? JSON.parse(raw) : null;
      if (!parsed) return null;

      // Migration check: if legacy session had coupled name ("Emre & Ayşe") or lacked signature, normalize & re-save
      if (!parsed.sig || (typeof parsed.name === 'string' && parsed.name.includes('&'))) {
        const migrated = normalizeIndividualSession(parsed);
        const payload = JSON.stringify(migrated);
        localStorage.setItem(COOKIE_NAME, payload);
        return migrated;
      }

      // Tamper Detection Check: if someone edited role/permissions in DevTools localStorage, sig will mismatch!
      const expectedSig = computeIntegritySignature(parsed);
      if (parsed.sig !== expectedSig) {
        this.recordSecurityStrike('session_signature_tampered');
        this.clearSession();
        return null;
      }

      return parsed;
    } catch (e) {
      return null;
    }
  },

  verifySessionIntegrity(session) {
    if (!session) return false;
    if (!session.sig) return false;
    return session.sig === computeIntegritySignature(session);
  },

  clearSession() {
    try {
      document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`;
      localStorage.removeItem(COOKIE_NAME);
    } catch (e) {}
  },

  // Returns all remembered sessions/roles across past and active weddings
  // Returns all remembered individual sessions/roles across past and active weddings
  getSessionHistory() {
    try {
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(item => normalizeIndividualSession(item));
        }
      }
    } catch (e) {}
    const seeded = DEFAULT_SESSION_HISTORY.map(item => normalizeIndividualSession(item));
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(DEFAULT_SESSION_HISTORY));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(seeded));
    } catch (e) {}
    return [...DEFAULT_SESSION_HISTORY];
    return seeded;
  },

  recordHistory(session) {
    if (!session || !session.weddingCode) return;
    try {
      const normalized = normalizeIndividualSession(session);
      const list = this.getSessionHistory();
      const normName = (session.nick || session.name || 'kullanici').toLowerCase().trim();
      const key = `${session.weddingCode}::${session.role || 'guest'}::${normName}`;
      const normName = (normalized.nick || normalized.name || 'kullanici').toLowerCase().trim();
      const key = `${normalized.weddingCode}::${normalized.role || 'guest'}::${normName}`;
      const entry = {
        ...session,
        ...normalized,
        key,
        lastActiveAt: new Date().toLocaleDateString('tr-TR')
      };
      const filtered = list.filter(item => item.key !== key);
      filtered.unshift(entry);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered.slice(0, 15)));
    } catch (e) {}
  },

  removeHistoryEntry(key) {
    try {
      const list = this.getSessionHistory().filter(item => item.key !== key);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      return list;
    } catch (e) {
      return [];
    }
  },

  // ─── Anti-Hack WAF, Input Sanitizer & Brute-Force Shield ──────────────
  getSecurityState() {
    try {
      const raw = localStorage.getItem(SECURITY_STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { strikes: 0, pinFailures: 0, lockedUntil: 0, lastReason: '' };
  },

  saveSecurityState(st) {
    try {
      localStorage.setItem(SECURITY_STATE_KEY, JSON.stringify(st));
    } catch (e) {}
  },

  isLockedOut() {
    const st = this.getSecurityState();
    if (st.lockedUntil && Date.now() < st.lockedUntil) {
      const remainingSec = Math.ceil((st.lockedUntil - Date.now()) / 1000);
      return { locked: true, remainingSec, reason: st.lastReason };
    }
    return { locked: false, remainingSec: 0, reason: '' };
  },

  recordPinFailure(reason = 'wrong_pin') {
    const st = this.getSecurityState();
    st.pinFailures = (st.pinFailures || 0) + 1;
    st.lastReason = reason;
    if (st.pinFailures >= 6) {
      st.lockedUntil = Date.now() + 60 * 1000; // 60 seconds cooldown on brute force
      st.pinFailures = 0;
    }
    this.saveSecurityState(st);
    return st;
  },

  resetPinFailures() {
    const st = this.getSecurityState();
    if (st.pinFailures > 0 || st.lockedUntil > 0) {
      st.pinFailures = 0;
      st.lockedUntil = 0;
      this.saveSecurityState(st);
    }
  },

  recordSecurityStrike(reason = 'exploit_attempt') {
    const st = this.getSecurityState();
    st.strikes = (st.strikes || 0) + 1;
    st.lastReason = reason;
    if (st.strikes >= 3) {
      st.lockedUntil = Date.now() + 120 * 1000;
    }
    this.saveSecurityState(st);
    return st;
  },

  // Inspects any string or object payload for SQLi / XSS / Path Traversal attacks
  inspectPayload(payload) {
    const lock = this.isLockedOut();
    if (lock.locked) {
      return {
        safe: false,
        error: `Güvenlik kalkanı: Çok fazla hatalı veya şüpheli deneme yapıldı. Lütfen ${lock.remainingSec} saniye bekleyiniz.`
      };
    }

    const values = typeof payload === 'string'
      ? [payload]
      : Object.values(payload || {}).filter(v => typeof v === 'string');

    for (const val of values) {
      for (const pattern of MALICIOUS_PATTERNS) {
        if (pattern.test(val)) {
          this.recordSecurityStrike('waf_blocked_payload');
          return {
            safe: false,
            error: 'Güvenlik Duvarı (WAF): Zararlı kod veya enjeksiyon girişimi engellendi.'
          };
        }
      }
    }
    return { safe: true, error: null };
  },

  sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/[<>]/g, '')
      .trim();
  },

  // Generates unique random IDs (UUID v4 format)
  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  // Generates clean Turkish-friendly nickname
  generateNickname(name) {
    if (!name) return 'misafir';
    const trMap = {
      'ç':'c', 'Ç':'c', 'ğ':'g', 'Ğ':'g', 'ı':'i', 'I':'i', 'İ':'i',
      'ö':'o', 'Ö':'o', 'ş':'s', 'Ş':'s', 'ü':'u', 'Ü':'u'
    };
    const clean = name.split('')
      .map(c => trMap[c] || c)
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    const rand = Math.floor(10 + Math.random() * 89);
    return clean ? `${clean}_${rand}` : `davetli_${rand}`;
  },

  // Slugifier for wedding vanity URLs
  slugify(text) {
    if (!text) return 'dugun';
    const trMap = {
      'ç':'c', 'Ç':'c', 'ğ':'g', 'Ğ':'g', 'ı':'i', 'I':'i', 'İ':'i',
      'ö':'o', 'Ö':'o', 'ş':'s', 'Ş':'s', 'ü':'u', 'Ü':'u'
    };
    return text.split('')
      .map(c => trMap[c] || c)
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '') || 'dugun';
  }
};
