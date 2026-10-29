// ─── Repository Pattern (SaaS Data Access Layer) ───────────
import { SecurityVault } from './security.js';

const STORAGE_KEYS = {
  WEDDINGS: 'fy_weddings_v2',
  PHOTOS: 'fy_photos_v2',
  ATTENDANCE: 'fy_attendance_v2',
  SHARE_LINKS: 'fy_share_links_v2'
  SHARE_LINKS: 'fy_share_links_v2',
  MEMBERS: 'fy_members_v1'
};

// Default seed data for initial runtime (Includes active wedding + a past completed wedding for Portfolio/History)
// Note: ownerName is always an explicit individual person (e.g. "Mehmet Yılmaz"), never a combined couple name like "Emre & Ayşe".
const SEED_WEDDINGS = [
  {
    id: 'w-ayse-mehmet',
    code: 'ayse-mehmet',
    slug: 'ayse-mehmet',
    name: 'Ayşe & Mehmet',
    date: '2026-11-15',
    venue: 'Çırağan Kempinski · İstanbul',
    welcomeNote: 'çekilen her kare, paylaşılan her tebessüm saklanır.',
    ownerName: 'Emre & Ayşe',
    ownerRole: 'owner',
    ownerName: 'Mehmet Yılmaz',
    brideName: 'Ayşe Kaya',
    groomName: 'Mehmet Yılmaz',
    ownerRole: 'groom_owner',
    ownerPasscode: '1234',
    guestPasscode: '1234',
    allowGuestUploads: true,
    allowGuestDownloads: true,
    moderationMode: 'auto', // 'auto' | 'manual'
    watermarkOnPrint: true,
    isActive: true,
    createdAt: '28.10.2026'
  },
  {
    id: 'w-zeynep-can',
    code: 'zeynep-can',
    slug: 'zeynep-can',
    name: 'Zeynep & Can',
    date: '2026-09-14',
    venue: 'Esma Sultan Yalısı · İstanbul',
    welcomeNote: 'bu güzel gecede bizimle olduğunuz için teşekkür ederiz.',
    ownerName: 'Emre Yılmaz',
    ownerRole: 'photographer',
    ownerPasscode: '1234',
    guestPasscode: '1234',
    allowGuestUploads: true,
    allowGuestDownloads: true,
    moderationMode: 'auto',
    watermarkOnPrint: true,
    isActive: true,
    createdAt: '14.09.2026'
  }
];

const SEED_PHOTOS = [
  {
    id: 'p-1',
    weddingCode: 'ayse-mehmet',
    uploaderName: 'Ahmet Yılmaz',
    uploaderNick: 'ahmet_yilmaz_48',
    fileName: 'ilk-dans.jpg',
    dataUrl: createSampleSvg('Gelin Damat İlk Dans', '#4a3b32'),
    fileSize: 2450800,
    caption: 'İlk dans anımız, müzik harikaydı.',
    comments: [{ id: 'c-1', author: 'Ayşe (Gelin)', text: 'En sevdiğim karelerden biri!', at: '14:22' }],
    tags: ['dans', 'çift'],
    taggedPersons: ['Ayşe & Mehmet'],
    isDeleted: false,
    deletedBy: null,
    deletedAt: null,
    uploadedAt: '28.10.2026 14:20'
  },
  {
    id: 'p-2',
    weddingCode: 'ayse-mehmet',
    uploaderName: 'Ahmet Yılmaz',
    uploaderNick: 'ahmet_yilmaz_48',
    fileName: 'pasta-kesimi.jpg',
    dataUrl: createSampleSvg('Pasta Kesimi', '#2c3e50'),
    fileSize: 1980400,
    caption: 'Pasta kesilirken herkes bir arada.',
    comments: [],
    tags: ['pasta', 'kutlama'],
    taggedPersons: ['Ahmet Yılmaz'],
    isDeleted: false,
    deletedBy: null,
    deletedAt: null,
    uploadedAt: '28.10.2026 14:25'
  },
  {
    id: 'p-3',
    weddingCode: 'ayse-mehmet',
    uploaderName: 'Selin Kaya',
    uploaderNick: 'selin_kaya_85',
    fileName: 'nikah-masasi.jpg',
    dataUrl: createSampleSvg('Nikah Masası', '#5b4033'),
    fileSize: 3120000,
    caption: 'Evet dedikleri o güzel an.',
    comments: [],
    tags: ['nikah', 'aile'],
    taggedPersons: ['Selin Kaya'],
    isDeleted: false,
    deletedBy: null,
    deletedAt: null,
    uploadedAt: '28.10.2026 14:40'
  },
  {
    id: 'p-4',
    weddingCode: 'ayse-mehmet',
    uploaderName: 'Can Demir',
    uploaderNick: 'can_demir_22',
    fileName: 'arkadaslar.jpg',
    dataUrl: createSampleSvg('Sağdıç & Arkadaşlar', '#34495e'),
    fileSize: 1850600,
    caption: '',
    comments: [],
    tags: ['arkadaşlar', 'sağdıç'],
    taggedPersons: ['Can Demir', 'Merve Aydın'],
    isDeleted: false,
    deletedBy: null,
    deletedAt: null,
    uploadedAt: '28.10.2026 15:10'
  },
  {
    id: 'p-past-1',
    weddingCode: 'zeynep-can',
    uploaderName: 'Emre Yılmaz',
    uploaderNick: 'emre_studyo',
    fileName: 'bogaz-nikah.jpg',
    dataUrl: createSampleSvg('Zeynep & Can · Boğaz Nikahı', '#2f3e46'),
    fileSize: 2890000,
    caption: 'Gün batımında boğaz kenarında nikah anı.',
    comments: [],
    tags: [],
    taggedPersons: ['Zeynep & Can'],
    isDeleted: false,
    deletedBy: null,
    deletedAt: null,
    uploadedAt: '14.09.2026 18:30'
  },
  {
    id: 'p-past-2',
    weddingCode: 'zeynep-can',
    uploaderName: 'Burak Özkan',
    uploaderNick: 'burak_ozkan_19',
    fileName: 'kutlama-gecesi.jpg',
    dataUrl: createSampleSvg('Zeynep & Can · Kutlama', '#3d405b'),
    fileSize: 2150000,
    caption: 'Tüm dostlarla harika bir akşam.',
    comments: [],
    tags: [],
    taggedPersons: [],
    isDeleted: false,
    deletedBy: null,
    deletedAt: null,
    uploadedAt: '14.09.2026 21:15'
  }
];

const SEED_ATTENDANCE = [
  {
    id: 'att-1',
    weddingCode: 'ayse-mehmet',
    name: 'Ahmet Yılmaz',
    nick: 'ahmet_yilmaz_48',
    ref: 'damat',
    refLabel: 'damat davetlisi',
    sharedBy: 'Mehmet (Damat)',
    shareTokenId: 'sl-seed-1',
    phone: '0532 111 22 33',
    joinedAt: '28.10.2026 14:20'
  },
  {
    id: 'att-2',
    weddingCode: 'ayse-mehmet',
    name: 'Selin Kaya',
    nick: 'selin_kaya_85',
    ref: 'gelin',
    refLabel: 'gelin davetlisi',
    sharedBy: 'Ayşe (Gelin)',
    shareTokenId: 'sl-seed-2',
    phone: '0544 333 44 55',
    joinedAt: '28.10.2026 14:35'
  },
  {
    id: 'att-3',
    weddingCode: 'ayse-mehmet',
    name: 'Can Demir',
    nick: 'can_demir_22',
    ref: 'masa-qr',
    refLabel: 'masa qr',
    sharedBy: 'Masa 4 QR Kartı',
    shareTokenId: 'sl-seed-3',
    phone: '',
    joinedAt: '28.10.2026 15:00'
  },
  {
    id: 'att-4',
    weddingCode: 'ayse-mehmet',
    name: 'Merve Aydın',
    nick: 'merve_aydin_14',
    ref: 'gelin',
    refLabel: 'gelin davetlisi',
    sharedBy: 'Ayşe (Gelin)',
    shareTokenId: 'sl-seed-2',
    phone: '',
    joinedAt: '28.10.2026 15:15'
  }
];

const SEED_SHARE_LINKS = [
  {
    id: 'sl-seed-1',
    weddingCode: 'ayse-mehmet',
    shareType: 'link',
    channel: 'damat',
    sharedByName: 'Mehmet (Damat)',
    sharedByRole: 'owner',
    sharedToName: 'Ahmet Yılmaz',
    sharedAt: '28.10.2026 14:10',
    openCount: 3,
    joinCount: 1,
    lastOpenedAt: '28.10.2026 14:20',
    lastOpenedBy: 'Ahmet Yılmaz',
    isRevoked: false
  },
  {
    id: 'sl-seed-2',
    weddingCode: 'ayse-mehmet',
    shareType: 'link',
    channel: 'gelin',
    sharedByName: 'Ayşe (Gelin)',
    sharedByRole: 'owner',
    sharedToName: 'Üniversite Arkadaş Grubu',
    sharedAt: '28.10.2026 14:15',
    openCount: 6,
    joinCount: 2,
    lastOpenedAt: '28.10.2026 15:15',
    lastOpenedBy: 'Merve Aydın',
    isRevoked: false
  },
  {
    id: 'sl-seed-3',
    weddingCode: 'ayse-mehmet',
    shareType: 'qr',
    channel: 'masa-qr',
    sharedByName: 'Emre & Ayşe',
    sharedByRole: 'owner',
    sharedByName: 'Mehmet Yılmaz (Damat)',
    sharedByRole: 'groom_owner',
    sharedToName: 'Masa 4 QR Kartı',
    sharedAt: '28.10.2026 13:30',
    openCount: 4,
    joinCount: 1,
    lastOpenedAt: '28.10.2026 15:00',
    lastOpenedBy: 'Can Demir',
    isRevoked: false
  }
];

// ─── Seed Roles & Responsibilities Table (wedding_members RBAC) ──────
const SEED_MEMBERS = [
  {
    id: 'mem-groom-1',
    weddingCode: 'ayse-mehmet',
    personName: 'Mehmet Yılmaz',
    nick: 'mehmet_yilmaz',
    phone: '0532 100 10 10',
    role: 'groom_owner',
    roleTitle: 'Düğün Sahibi · Damat',
    customPin: '1234',
    canManageSettings: true,
    canAssignRoles: true,
    canModeratePhotos: true,
    canShareLinks: true,
    canPrintExport: true,
    canUpload: true,
    assignedBy: 'Kurucu',
    createdAt: '28.10.2026',
    isActive: true
  },
  {
    id: 'mem-bride-1',
    weddingCode: 'ayse-mehmet',
    personName: 'Ayşe Kaya',
    nick: 'ayse_kaya',
    phone: '0532 200 20 20',
    role: 'bride_owner',
    roleTitle: 'Düğün Sahibi · Gelin',
    customPin: '1234',
    canManageSettings: true,
    canAssignRoles: true,
    canModeratePhotos: true,
    canShareLinks: true,
    canPrintExport: true,
    canUpload: true,
    assignedBy: 'Kurucu',
    createdAt: '28.10.2026',
    isActive: true
  },
  {
    id: 'mem-bestman-1',
    weddingCode: 'ayse-mehmet',
    personName: 'Burak Özkan',
    nick: 'burak_ozkan_19',
    phone: '0533 444 55 66',
    role: 'bestman',
    roleTitle: 'Sağdıç / Nedime · Yardımcı Yönetici',
    customPin: '1234',
    canManageSettings: false,
    canAssignRoles: false,
    canModeratePhotos: true,
    canShareLinks: true,
    canPrintExport: true,
    canUpload: true,
    assignedBy: 'Mehmet Yılmaz',
    createdAt: '28.10.2026',
    isActive: true
  },
  {
    id: 'mem-mod-1',
    weddingCode: 'ayse-mehmet',
    personName: 'Ahmet Yılmaz',
    nick: 'ahmet_yilmaz_48',
    phone: '0532 111 22 33',
    role: 'member_manager',
    roleTitle: 'Yetkili Üye · Galeri Moderatörü',
    customPin: '1234',
    canManageSettings: false,
    canAssignRoles: false,
    canModeratePhotos: true,
    canShareLinks: true,
    canPrintExport: true,
    canUpload: true,
    assignedBy: 'Mehmet Yılmaz',
    createdAt: '28.10.2026',
    isActive: true
  },
  {
    id: 'mem-guest-1',
    weddingCode: 'ayse-mehmet',
    personName: 'Selin Kaya',
    nick: 'selin_kaya_85',
    phone: '0544 333 44 55',
    role: 'guest',
    roleTitle: 'Davetli Üye',
    customPin: '',
    canManageSettings: false,
    canAssignRoles: false,
    canModeratePhotos: false,
    canShareLinks: false,
    canPrintExport: false,
    canUpload: true,
    assignedBy: 'Ayşe Kaya',
    createdAt: '28.10.2026',
    isActive: true
  },
  {
    id: 'mem-photo-zeynep',
    weddingCode: 'zeynep-can',
    personName: 'Emre Yılmaz',
    nick: 'emre_studyo',
    phone: '0532 999 88 77',
    role: 'photographer',
    roleTitle: 'Düğün Fotoğrafçısı · Organizasyon',
    customPin: '1234',
    canManageSettings: true,
    canAssignRoles: false,
    canModeratePhotos: true,
    canShareLinks: true,
    canPrintExport: true,
    canUpload: true,
    assignedBy: 'Kurucu',
    createdAt: '14.09.2026',
    isActive: true
  }
];

function createSampleSvg(text, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${bg}"/><circle cx="200" cy="170" r="60" fill="rgba(255,255,255,0.18)"/><path d="M160 270 Q200 240 240 270" stroke="rgba(255,255,255,0.3)" stroke-width="4" fill="none"/><text x="200" y="320" font-family="Georgia, serif" font-size="20" fill="#ffffff" text-anchor="middle" font-weight="300">${text}</text><text x="200" y="348" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle">fotoyonetim</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ─── 1. Wedding Repository ─────────────────────────────────
export const WeddingRepository = {
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WEDDINGS);
      if (raw) return JSON.parse(raw);
      if (raw) {
        const parsed = JSON.parse(raw);
        let changed = false;
        parsed.forEach(w => {
          if (w.ownerName === 'Emre & Ayşe') {
            w.ownerName = 'Mehmet Yılmaz';
            w.brideName = 'Ayşe Kaya';
            w.groomName = 'Mehmet Yılmaz';
            w.ownerRole = 'groom_owner';
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem(STORAGE_KEYS.WEDDINGS, JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch (e) {}
    localStorage.setItem(STORAGE_KEYS.WEDDINGS, JSON.stringify(SEED_WEDDINGS));
    return [...SEED_WEDDINGS];
  },

  findByCodeOrSlug(query) {
    if (!query) return null;
    const clean = query.trim().toLowerCase();
    const slugQuery = SecurityVault.slugify(query);
    const list = this.getAll();
    return list.find(w =>
      w.code === clean ||
      w.slug === clean ||
      w.code === slugQuery ||
      w.slug === slugQuery ||
      (w.code && slugQuery && w.code.startsWith(slugQuery + '-')) ||
      (w.name && w.name.toLowerCase() === clean) ||
      (w.name && w.name.toLowerCase().includes(clean)) ||
      (w.name && SecurityVault.slugify(w.name) === slugQuery)
    ) || null;
  },

  upsertFromServer(serverWedding) {
    if (!serverWedding || !serverWedding.code) return null;
    const list = this.getAll();
    const existingIdx = list.findIndex(w => w.code === serverWedding.code || w.id === serverWedding.id);
    const merged = {
      id: serverWedding.id || SecurityVault.generateUUID(),
      code: serverWedding.code,
      slug: SecurityVault.slugify(serverWedding.name || serverWedding.code),
      name: serverWedding.name || serverWedding.code,
      date: serverWedding.date || '',
      ownerName: serverWedding.owner_name || serverWedding.ownerName || '',
      ownerRole: serverWedding.owner_role || serverWedding.ownerRole || 'owner',
      ownerPasscode: serverWedding.owner_passcode || serverWedding.ownerPasscode || '1234',
      guestPasscode: serverWedding.guest_passcode || serverWedding.guestPasscode || '1234',
      isActive: serverWedding.is_active !== false,
      createdAt: serverWedding.created_at || new Date().toLocaleDateString('tr-TR')
    };
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...merged };
    } else {
      list.unshift(merged);
    }
    localStorage.setItem(STORAGE_KEYS.WEDDINGS, JSON.stringify(list));
    return merged;
  },

  create({ name, date, ownerName, ownerRole, ownerPasscode, guestPasscode }) {
    const list = this.getAll();
    const slug = SecurityVault.slugify(name);
    let code = slug;
    if (list.some(w => w.code === code)) {
      code = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const newWedding = {
      id: SecurityVault.generateUUID(),
      code,
      slug,
      name: name.trim(),
      date: date || new Date().toISOString().split('T')[0],
      ownerName: (ownerName || '').trim() || `${name.trim()} Yöneticisi`,
      ownerRole: ownerRole || 'owner',
      ownerPasscode: (ownerPasscode || '').trim() || '1234',
      guestPasscode: (guestPasscode || ownerPasscode || '').trim() || '1234',
      isActive: true,
      createdAt: new Date().toLocaleDateString('tr-TR')
    };
    list.unshift(newWedding);
    localStorage.setItem(STORAGE_KEYS.WEDDINGS, JSON.stringify(list));
    return newWedding;
  },

  verifyOwnerPassword(wedding, passcode) {
    if (!wedding) return false;
    const expected = wedding.ownerPasscode || '1234';
    return (passcode || '').trim() === expected.trim();
  },

  verifyGuestPassword(wedding, passcode) {
    if (!wedding) return false;
    const expected = wedding.guestPasscode || wedding.ownerPasscode || '1234';
    return (passcode || '').trim() === expected.trim();
  },

  updatePasscodes(weddingCode, { ownerPasscode, guestPasscode }) {
    const list = this.getAll();
    const w = list.find(item => item.code === weddingCode || item.slug === weddingCode);
    if (w) {
      if (ownerPasscode !== undefined && ownerPasscode.trim()) {
        w.ownerPasscode = ownerPasscode.trim();
      }
      if (guestPasscode !== undefined && guestPasscode.trim()) {
        w.guestPasscode = guestPasscode.trim();
      }
      localStorage.setItem(STORAGE_KEYS.WEDDINGS, JSON.stringify(list));
    }
    return w;
  },

  updateSettings(weddingCode, settings = {}) {
    const list = this.getAll();
    const w = list.find(item => item.code === weddingCode || item.slug === weddingCode);
    if (w) {
      if (settings.name !== undefined && settings.name.trim()) w.name = settings.name.trim();
      if (settings.date !== undefined) w.date = settings.date;
      if (settings.venue !== undefined) w.venue = settings.venue.trim();
      if (settings.welcomeNote !== undefined) w.welcomeNote = settings.welcomeNote.trim();
      if (settings.allowGuestUploads !== undefined) w.allowGuestUploads = Boolean(settings.allowGuestUploads);
      if (settings.allowGuestDownloads !== undefined) w.allowGuestDownloads = Boolean(settings.allowGuestDownloads);
      if (settings.moderationMode !== undefined) w.moderationMode = settings.moderationMode;
      if (settings.watermarkOnPrint !== undefined) w.watermarkOnPrint = Boolean(settings.watermarkOnPrint);
      localStorage.setItem(STORAGE_KEYS.WEDDINGS, JSON.stringify(list));
    }
    return w;
  }
};

// ─── 2. Photo Repository (UC-1, UC-7 Soft Delete, UC-18 Limit)
export const PhotoRepository = {
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PHOTOS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    localStorage.setItem(STORAGE_KEYS.PHOTOS, JSON.stringify(SEED_PHOTOS));
    return [...SEED_PHOTOS];
  },

  listByWedding(weddingCode) {
    const photos = this.getAll();
    return photos.filter(p => (p.weddingCode === weddingCode) && !p.isDeleted);
  },

  listArchivedByWedding(weddingCode) {
    const photos = this.getAll();
    return photos.filter(p => (p.weddingCode === weddingCode) && p.isDeleted);
  },

  listByGuest(weddingCode, guestNick) {
    const photos = this.getAll();
    return photos.filter(p => (p.weddingCode === weddingCode) && (p.uploaderNick === guestNick) && !p.isDeleted);
  },

  addPhotos(photosToAdd) {
    const list = this.getAll();
    list.unshift(...photosToAdd);
    localStorage.setItem(STORAGE_KEYS.PHOTOS, JSON.stringify(list));
    return list;
  },

  softDelete(photoIds, deletedByName = 'Yönetici') {
    const idSet = new Set(photoIds);
    const list = this.getAll();
    const now = new Date().toISOString();
    list.forEach(p => {
      if (idSet.has(p.id)) {
        p.isDeleted = true;
        p.deletedBy = deletedByName;
        p.deletedAt = now;
      }
    });
    localStorage.setItem(STORAGE_KEYS.PHOTOS, JSON.stringify(list));
    return list;
  },

  restore(photoIds) {
    const idSet = new Set(photoIds);
    const list = this.getAll();
    list.forEach(p => {
      if (idSet.has(p.id)) {
        p.isDeleted = false;
        p.deletedBy = null;
        p.deletedAt = null;
      }
    });
    localStorage.setItem(STORAGE_KEYS.PHOTOS, JSON.stringify(list));
    return list;
  },

  // UC-8 & UC-21: Add Tag or Person Label to Photo(s)
  addTag(photoIds, tagText, personName = '') {
    const ids = Array.isArray(photoIds) ? new Set(photoIds) : new Set([photoIds]);
    const cleanTag = (tagText || '').replace(/^#+/, '').trim().toLowerCase();
    const cleanPerson = (personName || '').trim();
    const list = this.getAll();

    list.forEach(p => {
      if (ids.has(p.id)) {
        if (!Array.isArray(p.tags)) p.tags = [];
        if (!Array.isArray(p.taggedPersons)) p.taggedPersons = [];
        if (cleanTag && !p.tags.includes(cleanTag)) {
          p.tags.push(cleanTag);
        }
        if (cleanPerson && !p.taggedPersons.includes(cleanPerson)) {
          p.taggedPersons.push(cleanPerson);
        }
      }
    });
    localStorage.setItem(STORAGE_KEYS.PHOTOS, JSON.stringify(list));

    if (typeof fetch !== 'undefined' && cleanTag) {
      ids.forEach(id => {
        fetch(`/api/v1/photos/${encodeURIComponent(id)}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: cleanTag })
        }).catch(() => {});
      });
    }
    return list;
  },

  removeTag(photoId, tagText) {
    const list = this.getAll();
    const p = list.find(item => item.id === photoId);
    if (p && Array.isArray(p.tags)) {
      p.tags = p.tags.filter(t => t !== tagText);
      localStorage.setItem(STORAGE_KEYS.PHOTOS, JSON.stringify(list));
    }
    return list;
  },

  // Fotoğrafın altına / içine anı notu (caption) veya yorum yazma
  updateCaptionAndNote(photoIds, { caption, commentText, authorName }) {
    const ids = Array.isArray(photoIds) ? new Set(photoIds) : new Set([photoIds]);
    const list = this.getAll();
    const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    list.forEach(p => {
      if (ids.has(p.id)) {
        if (typeof caption === 'string') {
          p.caption = caption.trim();
        }
        if (commentText && commentText.trim()) {
          if (!Array.isArray(p.comments)) p.comments = [];
          p.comments.push({
            id: 'c_' + SecurityVault.generateUUID(),
            author: authorName || 'Davetli',
            text: commentText.trim(),
            at: nowTime
          });
        }
      }
    });
    localStorage.setItem(STORAGE_KEYS.PHOTOS, JSON.stringify(list));
    return list;
  },

  // UC-10: Search photos by guest name, nick, tag, caption, or tagged person
  search(weddingCode, query, photosList = null) {
    const base = photosList || this.listByWedding(weddingCode);
    if (!query || !query.trim()) return base;
    const q = query.replace(/^#+/, '').trim().toLowerCase();
    return base.filter(p => {
      const matchUploader = (p.uploaderName || '').toLowerCase().includes(q) || (p.uploaderNick || '').toLowerCase().includes(q);
      const matchFile = (p.fileName || '').toLowerCase().includes(q);
      const matchCaption = (p.caption || '').toLowerCase().includes(q);
      const matchTag = Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q));
      const matchPerson = Array.isArray(p.taggedPersons) && p.taggedPersons.some(person => person.toLowerCase().includes(q));
      return matchUploader || matchFile || matchCaption || matchTag || matchPerson;
    });
  }
};

// ─── 3. Attendance & Tracking Repository (UC-20) ───────────
export const AttendanceRepository = {
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(SEED_ATTENDANCE));
    return [...SEED_ATTENDANCE];
  },

  listByWedding(weddingCode) {
    const list = this.getAll();
    return list.filter(a => a.weddingCode === weddingCode);
  },

  getStatsByWedding(weddingCode) {
    const list = this.listByWedding(weddingCode);
    return {
      total: list.length,
      gelin: list.filter(a => a.ref === 'gelin').length,
      damat: list.filter(a => a.ref === 'damat').length,
      qr: list.filter(a => a.ref === 'masa-qr' || a.ref === 'qr').length
    };
  },

  recordEntry({ weddingCode, name, nick, ref, sharedBy, shareTokenId, phone }) {
    const list = this.getAll();
    const cleanRef = (ref || 'direkt').toLowerCase();
    let refLabel = 'doğrudan giriş';
    if (cleanRef === 'gelin') refLabel = 'gelin davetlisi';
    else if (cleanRef === 'damat') refLabel = 'damat davetlisi';
    else if (cleanRef === 'masa-qr' || cleanRef === 'qr') refLabel = 'masa qr';
    else if (cleanRef === 'fotografci') refLabel = 'fotoğrafçı';

    const nowStr = new Date().toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    let existing = list.find(a => a.weddingCode === weddingCode && (a.nick === nick || (a.name === name && name)));
    if (existing) {
      existing.lastActive = nowStr;
      if (phone && !existing.phone) existing.phone = phone;
      if (sharedBy && !existing.sharedBy) existing.sharedBy = sharedBy;
      if (shareTokenId && !existing.shareTokenId) existing.shareTokenId = shareTokenId;
    } else {
      existing = {
        id: SecurityVault.generateUUID(),
        weddingCode,
        name: name || 'Davetli',
        nick: nick || 'davetli',
        ref: cleanRef,
        refLabel,
        sharedBy: (sharedBy || '').trim(),
        shareTokenId: (shareTokenId || '').trim(),
        phone: phone || '',
        joinedAt: nowStr
      };
      list.unshift(existing);
    }
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify(list));
    return existing;
  }
};

// ─── 4. ShareLink & QR Ledger Repository (Who gave to whom & when) ───
export const ShareLinkRepository = {
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SHARE_LINKS);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    localStorage.setItem(STORAGE_KEYS.SHARE_LINKS, JSON.stringify(SEED_SHARE_LINKS));
    return [...SEED_SHARE_LINKS];
  },

  listByWedding(weddingCode) {
    if (!weddingCode) return [];
    return this.getAll().filter(s => s.weddingCode === weddingCode);
  },

  findById(id) {
    if (!id) return null;
    return this.getAll().find(s => s.id === id) || null;
  },

  create({ id, weddingCode, shareType = 'link', channel = 'direkt', sharedByName = 'Yönetici', sharedByRole = 'owner', sharedToName = '' }) {
    const list = this.getAll();
    const nowStr = new Date().toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const record = {
      id: id || ('sl-' + Math.random().toString(36).slice(2, 10)),
      weddingCode,
      shareType: shareType || 'link',
      channel: channel || 'direkt',
      sharedByName: (sharedByName || 'Yönetici').trim(),
      sharedByRole: sharedByRole || 'owner',
      sharedToName: (sharedToName || '').trim() || 'Genel Davetli',
      sharedAt: nowStr,
      openCount: 0,
      joinCount: 0,
      lastOpenedAt: '',
      lastOpenedBy: '',
      isRevoked: false
    };
    list.unshift(record);
    localStorage.setItem(STORAGE_KEYS.SHARE_LINKS, JSON.stringify(list));

    // Sync to Go SQLite backend asynchronously
    if (typeof fetch !== 'undefined' && weddingCode) {
      fetch(`/api/v1/weddings/${encodeURIComponent(weddingCode)}/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          share_type: record.shareType,
          channel: record.channel,
          shared_by_name: record.sharedByName,
          shared_by_role: record.sharedByRole,
          shared_to_name: record.sharedToName
        })
      }).catch(() => {});
    }

    return record;
  },

  recordOpen(id, openedBy = '') {
    if (!id) return null;
    const list = this.getAll();
    const item = list.find(s => s.id === id && !s.isRevoked);
    if (item) {
      item.openCount = (item.openCount || 0) + 1;
      item.lastOpenedAt = new Date().toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      if (openedBy && openedBy.trim()) {
        item.lastOpenedBy = openedBy.trim();
      }
      localStorage.setItem(STORAGE_KEYS.SHARE_LINKS, JSON.stringify(list));
    }

    if (typeof fetch !== 'undefined') {
      fetch(`/api/v1/shares/${encodeURIComponent(id)}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opened_by: openedBy || '' })
      }).catch(() => {});
    }

    return item;
  },

  recordJoin(id, joinedBy = '') {
    if (!id) return null;
    const list = this.getAll();
    const item = list.find(s => s.id === id && !s.isRevoked);
    if (item) {
      item.joinCount = (item.joinCount || 0) + 1;
      item.lastOpenedAt = new Date().toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      if (joinedBy && joinedBy.trim()) {
        item.lastOpenedBy = joinedBy.trim();
      }
      localStorage.setItem(STORAGE_KEYS.SHARE_LINKS, JSON.stringify(list));
    }
    return item;
  },

  revoke(id) {
    const list = this.getAll();
    const item = list.find(s => s.id === id);
    if (item) {
      item.isRevoked = true;
      localStorage.setItem(STORAGE_KEYS.SHARE_LINKS, JSON.stringify(list));
    }
    if (typeof fetch !== 'undefined') {
      fetch(`/api/v1/shares/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }
    return list;
  }
};

// ─── 5. Member & Responsibilities Repository (Görev ve Sorumluluk Tablosu — RBAC) ───
export const MemberRepository = {
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.MEMBERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(SEED_MEMBERS));
    return [...SEED_MEMBERS];
  },

  listByWedding(weddingCode) {
    if (!weddingCode) return [];
    return this.getAll().filter(m => m.weddingCode === weddingCode && m.isActive !== false);
  },

  findByNameOrNick(weddingCode, nameOrNick) {
    if (!weddingCode || !nameOrNick) return null;
    const q = nameOrNick.trim().toLowerCase();
    return this.listByWedding(weddingCode).find(m =>
      (m.personName && m.personName.trim().toLowerCase() === q) ||
      (m.nick && m.nick.trim().toLowerCase() === q)
    ) || null;
  },

  upsertMember({
    weddingCode,
    personName,
    nick,
    phone = '',
    role = 'guest',
    customPin = '',
    assignedBy = 'Yönetici',
    customPermissions = null
  }) {
    if (!weddingCode || !personName || !personName.trim()) return null;
    const list = this.getAll();
    const cleanName = SecurityVault.sanitizeText(personName);
    const cleanNick = (nick || '').trim() || SecurityVault.generateNickname(cleanName);
    const perms = customPermissions || SecurityVault.getDefaultPermissions(role);
    const roleTitle = SecurityVault.getRoleTitle(role);

    const existingIdx = list.findIndex(m =>
      m.weddingCode === weddingCode &&
      ((m.personName && m.personName.toLowerCase() === cleanName.toLowerCase()) ||
       (m.nick && m.nick.toLowerCase() === cleanNick.toLowerCase()))
    );

    const entry = {
      id: existingIdx >= 0 ? list[existingIdx].id : ('mem-' + SecurityVault.generateUUID()),
      weddingCode,
      personName: cleanName,
      nick: existingIdx >= 0 ? list[existingIdx].nick : cleanNick,
      phone: (phone || (existingIdx >= 0 ? list[existingIdx].phone : '') || '').trim(),
      role,
      roleTitle,
      customPin: (customPin || (existingIdx >= 0 ? list[existingIdx].customPin : '') || '').trim(),
      canManageSettings: Boolean(perms.canManageSettings),
      canAssignRoles: Boolean(perms.canAssignRoles),
      canModeratePhotos: Boolean(perms.canModeratePhotos),
      canShareLinks: Boolean(perms.canShareLinks),
      canPrintExport: Boolean(perms.canPrintExport),
      canUpload: perms.canUpload !== false,
      assignedBy: (assignedBy || 'Yönetici').trim(),
      createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : new Date().toLocaleDateString('tr-TR'),
      isActive: true
    };

    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.unshift(entry);
    }

    localStorage.setItem(STORAGE_KEYS.MEMBERS, JSON.stringify(list));
    return entry;
  }
};
