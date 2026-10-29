// ─── Zustand State Store (FotoYönetim SaaS Architecture) ───────
import { SecurityVault } from '../services/security.js';
import { LinkEngine } from '../services/linkEngine.js';
import { WeddingRepository, PhotoRepository, AttendanceRepository, ShareLinkRepository, MemberRepository } from '../services/repositories.js';
import { useState as reactUseState, useEffect as reactUseEffect, useRef as reactUseRef } from '../react.js';

function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, k) || !Object.is(a[k], b[k])) {
      return false;
    }
  }
  return true;
}

// Minimalist Zustand-compatible store implementation (zero external dependency required in vanilla browser)
function createStore(stateCreator) {
  let state;
  const listeners = new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === 'function' ? partial(state) : partial;
    if (!Object.is(nextState, state)) {
      state = replace ? nextState : Object.assign({}, state, nextState);
      listeners.forEach(listener => listener(state));
    }
  };
  const getState = () => state;
  const subscribe = listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  state = stateCreator(setState, getState, { setState, getState, subscribe });
  return { setState, getState, subscribe };
}

export const useAppStore = createStore((set, get) => ({
  // Screen & Navigation
  activeScreen: 'SPLASH',
  landingTab: 'guest',       // 'guest' | 'manage'
  manageMode: 'login',       // Sub-toggle: 'login' | 'create'

  // User Identity & Multi-Session History ("Önceki Rollerim ve Düğünler")
  user: SecurityVault.getSession() || null,
  sessionHistory: SecurityVault.getSessionHistory() || [],
  isSwitchingAccount: false, // "başka hesap"a basıldığında formu açar ama geri dönme yolunu korur

  // Wedding & Link Attribution Context
  wedding: null,
  incomingRef: null,
  incomingSharedBy: null,
  incomingSharedTo: null,
  incomingShareType: 'link',
  incomingShareTokenId: null,
  invalidLinkCode: null,

  // Gallery, Search, Tags & Selection (UC-8, UC-10, UC-33..37)
  photos: [],
  selectedPhotos: [],
  isSelectionMode: false,
  searchQuery: '',
  activeTagFilter: '',
  guestFilter: null,         // Filter photos by specific guest nick
  lastUploadedIds: [],       // 2. Aşama: Yeni yüklenen fotoğraflara toplu not/etiket veya yeni toplu ekleme önerisi

  // Tracking, Attendees, Members (RBAC Table) & Share Ledger
  attendees: [],
  members: [],
  shareLinks: [],
  attendeeFilter: 'all',     // 'all' | 'gelin' | 'damat' | 'masa-qr'

  // Modals & Secondary Drawers (P1/P2 Progressive Disclosure)
  toasts: [],
  isAuthModalOpen: false,
  isLegalModalOpen: false,
  legalModalType: 'kvkk',
  lightboxPhotoId: null,     // Fullscreen photo viewer + inline caption writer
  isOwnerSettingsOpen: false,// P2 Settings drawer: Passcodes, Archive (UC-7), Bestman (UC-16)
  isGuestNotifyOpen: false,  // P2 Guest drawer: "Beni Bul / Bildirim Al"
  isHierarchyOpen: false,    // Düğün Hiyerarşisi & "Ben Kimim?" Görünümü
  uploadProgress: null,

  // ─── Security & RBAC Middleware ───────────────────────────
  // 1. Anti-Hack WAF Middleware: Inspects inputs for SQLi/XSS/Traversal and brute-force lockouts
  guardSecurityInput: (payload) => {
    const check = SecurityVault.inspectPayload(payload);
    if (!check.safe) {
      get().toast(check.error);
      return false;
    }
    return true;
  },

  // 2. RBAC Permission Enforcement Middleware:
  // Verifies cryptographic session signature (detects localStorage/DevTools tampering)
  // AND checks live permissions in MemberRepository before allowing sensitive actions.
  requirePermission: (permKey, actionLabel = 'bu işlem') => {
    const user = get().user;
    const wedding = get().wedding;
    if (!user || !wedding) {
      get().toast(`Yetki reddedildi: ${actionLabel} için oturum açmanız gerekiyor.`);
      return false;
    }

    // Verify cryptographic integrity signature
    if (!SecurityVault.verifySessionIntegrity(user)) {
      SecurityVault.recordSecurityStrike('tampered_session_blocked');
      SecurityVault.clearSession();
      set({ user: null, activeScreen: 'ROLE_SELECT' });
      get().toast('Güvenlik kalkanı: Oturum yetki imzasında müdahale tespit edildi. Oturum kapatıldı.');
      return false;
    }

    // Re-verify against live MemberRepository RBAC table
    const liveMember = MemberRepository.findByNameOrNick(wedding.code, user.name || user.nick);
    const perms = liveMember
      ? {
          canManageSettings: liveMember.canManageSettings,
          canAssignRoles: liveMember.canAssignRoles,
          canModeratePhotos: liveMember.canModeratePhotos,
          canShareLinks: liveMember.canShareLinks,
          canPrintExport: liveMember.canPrintExport,
          canUpload: liveMember.canUpload
        }
      : (user.permissions || SecurityVault.getDefaultPermissions(user.role));

    if (!perms[permKey]) {
      SecurityVault.recordSecurityStrike(`unauthorized_perm_${permKey}`);
      get().toast(`Yetki Sınırı: "${user.roleTitle || SecurityVault.getRoleTitle(user.role)}" görevinde ${actionLabel} yetkisi bulunmuyor.`);
      return false;
    }
    return true;
  },

  // Assign or change a member/guest's role in the wedding's Görev ve Sorumluluk Tablosu (RBAC)
  assignMemberRole: ({ personName, nick, phone = '', role = 'member_manager', customPin = '' }) => {
    if (!get().guardSecurityInput({ personName, nick, role, customPin })) return null;
    if (!get().requirePermission('canAssignRoles', 'görev ve yetki atama')) return null;

    const wedding = get().wedding;
    const user = get().user;
    if (!wedding) return null;

    const pinToAssign = (customPin || '').trim() || (
      role === 'guest' ? '' : (wedding.ownerPasscode || '1234')
    );

    const updatedMember = MemberRepository.upsertMember({
      weddingCode: wedding.code,
      personName,
      nick,
      phone,
      role,
      customPin: pinToAssign,
      assignedBy: user?.name || 'Düğün Sahibi'
    });

    const updatedMembers = MemberRepository.listByWedding(wedding.code);
    set({ members: updatedMembers });

    // Sync to Go SQLite RBAC endpoint
    if (typeof fetch !== 'undefined') {
      const headers = { 'Content-Type': 'application/json' };
      if (user?.memberToken) headers['X-Member-Token'] = user.memberToken;
      fetch(`/api/v1/weddings/${encodeURIComponent(wedding.code)}/members`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          person_name: updatedMember.personName,
          nick: updatedMember.nick,
          phone: updatedMember.phone,
          role: updatedMember.role,
          role_title: updatedMember.roleTitle,
          passcode: pinToAssign,
          assigned_by: updatedMember.assignedBy
        })
      }).catch(() => {});
    }

    get().toast(`${updatedMember.personName} → "${updatedMember.roleTitle}" olarak görevlendirildi.`);
    return updatedMember;
  },

  // ─── Actions ─────────────────────────────────────────────
  navigate: (screen) => set({ activeScreen: screen }),
  // Browser History Integration: pushes state so the browser's native Back/Forward buttons work naturally without fake header buttons
  navigate: (screen, opts = {}) => {
    set({ activeScreen: screen });
    if (!opts.fromPopState && typeof window !== 'undefined' && window.history) {
      const wCode = get().wedding?.code;
      const hashMap = {
        ROLE_SELECT: '#giris',
        OWNER_PANEL: wCode ? `#${wCode}/yonetim` : '#yonetim',
        INVITEE_PANEL: wCode ? `#${wCode}/galeri` : '#galeri',
        LINK_SHARE: wCode ? `#${wCode}/baglantilar` : '#baglantilar'
      };
      const targetHash = hashMap[screen] || '';
      if (targetHash && window.location.hash !== targetHash) {
        window.history.pushState({ fyScreen: screen, weddingCode: wCode }, '', targetHash);
      }
    }
  },

  toast: (message) => {
    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    set(state => ({ toasts: [...state.toasts, { id, message }] }));
    setTimeout(() => {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    }, 2800);
  },

  setLandingTab: (tab) => set({ landingTab: tab }),
  setManageMode: (mode) => set({ manageMode: mode }),

  openAuthModal: () => set({ isAuthModalOpen: true }),
  closeAuthModal: () => set({ isAuthModalOpen: false }),

  openLegalModal: (type = 'kvkk') => set({ isLegalModalOpen: true, legalModalType: type }),
  closeLegalModal: () => set({ isLegalModalOpen: false }),

  openLightbox: (photoId) => set({ lightboxPhotoId: photoId }),
  closeLightbox: () => set({ lightboxPhotoId: null }),

  openOwnerSettings: () => set({ isOwnerSettingsOpen: true }),
  closeOwnerSettings: () => set({ isOwnerSettingsOpen: false }),

  openGuestNotify: () => set({ isGuestNotifyOpen: true }),
  closeGuestNotify: () => set({ isGuestNotifyOpen: false }),

  openHierarchy: () => set({ isHierarchyOpen: true }),
  closeHierarchy: () => set({ isHierarchyOpen: false }),

  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveTagFilter: (tag) => set(state => ({
    activeTagFilter: state.activeTagFilter === tag ? '' : tag
  })),
  toggleSelectionMode: () => set(state => ({
    isSelectionMode: !state.isSelectionMode,
    selectedPhotos: state.isSelectionMode ? [] : state.selectedPhotos
  })),

  // Bootstrap from LinkEngine (clean URLs + query params + hash + session)
  bootstrap: () => {
    const session = SecurityVault.getSession();
    const parsed = LinkEngine.parseCurrentLocation();

    let code = parsed.code;
    let role = parsed.role;
    let ref = parsed.ref || null;
    let sharedBy = parsed.sharedBy || null;
    let sharedTo = parsed.sharedTo || null;
    let shareType = parsed.shareType || 'link';
    let shareTokenId = parsed.shareTokenId || null;

    if (shareTokenId) {
      const tokenRecord = ShareLinkRepository.findById(shareTokenId);
      if (tokenRecord && !tokenRecord.isRevoked) {
        if (!code) code = tokenRecord.weddingCode;
        if (!ref) ref = tokenRecord.channel;
        if (!sharedBy) sharedBy = tokenRecord.sharedByName;
        if (!sharedTo) sharedTo = tokenRecord.sharedToName;
        if (!shareType) shareType = tokenRecord.shareType;
        ShareLinkRepository.recordOpen(shareTokenId);
      }
    }

    let wedding = null;
    let photos = [];
    let attendees = [];
    let members = [];
    let shareLinks = [];
    let invalidLinkCode = null;

    const targetCode = code || (session && session.weddingCode);
    if (targetCode) {
      wedding = WeddingRepository.findByCodeOrSlug(targetCode);
      if (!wedding && code) {
        invalidLinkCode = code;
      }
      if (wedding) {
        photos = PhotoRepository.listByWedding(wedding.code);
        attendees = AttendanceRepository.listByWedding(wedding.code);
        members = MemberRepository.listByWedding(wedding.code);
        shareLinks = ShareLinkRepository.listByWedding(wedding.code);
      }
    }

    let nextScreen = 'ROLE_SELECT';
    let nextTab = 'guest';
    let nextMode = 'login';
    let openAuth = false;

    if (SecurityVault.isManagerRole(role) && wedding) {
      const isVerified = session && SecurityVault.isManagerRole(session.role, session.permissions) && (session.weddingCode === wedding.code);
      if (isVerified) {
        nextScreen = 'OWNER_PANEL';
      } else {
        nextScreen = 'ROLE_SELECT';
        nextTab = 'manage';
        nextMode = 'login';
        openAuth = true;
      }
    }

    set({
      wedding,
      photos,
      attendees,
      members,
      shareLinks,
      incomingRef: ref,
      incomingSharedBy: sharedBy,
      incomingSharedTo: sharedTo,
      incomingShareType: shareType,
      incomingShareTokenId: shareTokenId,
      invalidLinkCode,
      user: session,
      sessionHistory: SecurityVault.getSessionHistory(),
      isSwitchingAccount: false,
      activeScreen: nextScreen,
      landingTab: nextTab,
      manageMode: nextMode,
      isAuthModalOpen: openAuth
    });

    if (nextScreen === 'OWNER_PANEL' && wedding) {
      get().toast(`Hoş geldiniz · ${wedding.name} yönetim panelindesiniz.`);
    }

    // Server-backed Link Resolution
    if (targetCode && typeof fetch !== 'undefined') {
      const qs = new URLSearchParams();
      if (ref) qs.set('ref', ref);
      if (shareTokenId) qs.set('st', shareTokenId);
      fetch(`/api/v1/weddings/${encodeURIComponent(targetCode)}?${qs.toString()}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.code) {
            const synced = WeddingRepository.upsertFromServer(data);
            const updatedShares = ShareLinkRepository.listByWedding(synced.code);
            set({
              wedding: synced,
              invalidLinkCode: null,
              photos: PhotoRepository.listByWedding(synced.code),
              attendees: AttendanceRepository.listByWedding(synced.code),
              shareLinks: updatedShares
            });
            if (data.share_link) {
              set({
                incomingRef: get().incomingRef || data.share_link.channel,
                incomingSharedBy: get().incomingSharedBy || data.share_link.shared_by_name,
                incomingSharedTo: get().incomingSharedTo || data.share_link.shared_to_name,
                incomingShareType: data.share_link.share_type || 'link'
              });
            }
          }
        })
        .catch(() => {});
    }
  },

  // Resume existing cookie session or any past session from history in 1 click
  resumeSession: (targetSession = null) => {
    const session = targetSession || get().user || SecurityVault.getSession() || (get().sessionHistory && get().sessionHistory[0]);
    if (!session || !session.weddingCode) return;
    const wedding = WeddingRepository.findByCodeOrSlug(session.weddingCode);
    if (!wedding) return;

    // Look up live member record in RBAC table so permissions are always fresh
    const liveMember = MemberRepository.findByNameOrNick(wedding.code, session.name || session.nick);
    const effectiveRole = liveMember ? liveMember.role : session.role;
    const effectivePerms = liveMember
      ? {
          canManageSettings: liveMember.canManageSettings,
          canAssignRoles: liveMember.canAssignRoles,
          canModeratePhotos: liveMember.canModeratePhotos,
          canShareLinks: liveMember.canShareLinks,
          canPrintExport: liveMember.canPrintExport,
          canUpload: liveMember.canUpload
        }
      : (session.permissions || SecurityVault.getDefaultPermissions(effectiveRole));

    const signedSession = SecurityVault.setSession({
      ...session,
      role: effectiveRole,
      roleTitle: liveMember?.roleTitle || session.roleTitle || SecurityVault.getRoleTitle(effectiveRole),
      permissions: effectivePerms
    });

    const photos = PhotoRepository.listByWedding(wedding.code);
    const attendees = AttendanceRepository.listByWedding(wedding.code);
    const members = MemberRepository.listByWedding(wedding.code);
    const shareLinks = ShareLinkRepository.listByWedding(wedding.code);
    const isManager = SecurityVault.isManagerRole(signedSession.role, signedSession.permissions);

    set({
      user: signedSession,
      sessionHistory: SecurityVault.getSessionHistory(),
      isSwitchingAccount: false,
      wedding,
      photos,
      attendees,
      members,
      shareLinks,
      isHierarchyOpen: false,
      isOwnerSettingsOpen: false,
      activeScreen: isManager ? 'OWNER_PANEL' : 'INVITEE_PANEL'
      isOwnerSettingsOpen: false
    });
    get().navigate(isManager ? 'OWNER_PANEL' : 'INVITEE_PANEL');
    get().toast(`Hoş geldiniz · ${signedSession.name} (${signedSession.roleTitle})`);
  },

  // "başka hesap"a basıldığında hesabı silmez; geri dönülebilir şekilde geçiş modunu açar
  startSwitchAccount: () => {
    set({ isSwitchingAccount: true });
  },

  cancelSwitchAccount: () => {
    set({ isSwitchingAccount: false });
  },

  // Geçmişteki bir düğüne veya role (veya geçmiş işin fotoğraflarına/yönetimine) anında geçiş
  switchToWeddingOrSession: ({ weddingCode, role = 'owner', name }) => {
    const wedding = WeddingRepository.findByCodeOrSlug(weddingCode);
    if (!wedding) return;

    const currentUser = get().user;
    const history = SecurityVault.getSessionHistory();
    const matchedHistory = history.find(h => h.weddingCode === wedding.code && (!role || h.role === role));

    const nextSession = matchedHistory || {
      id: SecurityVault.generateUUID(),
      name: name || currentUser?.name || wedding.ownerName || 'Yönetici',
      nick: currentUser?.nick || SecurityVault.generateNickname(name || wedding.ownerName || 'yonetici'),
      role: role || wedding.ownerRole || 'owner',
      weddingCode: wedding.code,
      weddingName: wedding.name,
      status: 'verified'
    };

    get().resumeSession(nextSession);
  },

  updateWeddingSettings: (settings) => {
    if (!get().guardSecurityInput(settings)) return;
    if (!get().requirePermission('canManageSettings', 'düğün ayarlarını değiştirme')) return;
    const current = get().wedding;
    if (!current) return;
    const updated = WeddingRepository.updateSettings(current.code, settings);
    if (updated) {
      set({ wedding: { ...updated } });
      get().toast('Düğün ayarları kaydedildi.');
    }
  },

  cancelInvitation: () => {
    LinkEngine.clearAttribution();
    set({
      wedding: null,
      incomingRef: null,
      incomingSharedBy: null,
      incomingSharedTo: null,
      incomingShareTokenId: null,
      invalidLinkCode: null,
      photos: [],
      attendees: [],
      shareLinks: []
    });
    if (typeof window !== 'undefined' && window.history) {
      window.history.replaceState({}, document.title, window.location.pathname.split('/')[0] || '/');
    }
    get().toast('Özel davet bağlantısı iptal edildi. Düğün kodunu manuel girebilirsiniz.');
  },

  // Create a tracked share link or QR code record in DB ("who gave, to whom, when")
  createShareRecord: ({ channel, shareType = 'link', sharedByName, sharedToName }) => {
    if (!get().guardSecurityInput({ channel, shareType, sharedByName, sharedToName })) return null;
    if (!get().requirePermission('canShareLinks', 'davet bağlantısı ve QR üretme')) return null;
    const wedding = get().wedding;
    const user = get().user;
    if (!wedding) return null;

    const giverName = (sharedByName || '').trim() || user?.name || wedding.ownerName || 'Yönetici';
    const giverRole = user?.role || wedding.ownerRole || 'owner';
    const recipientName = (sharedToName || '').trim() || (
      channel === 'gelin' ? 'Gelin Tarafı Davetlileri' :
      channel === 'damat' ? 'Damat Tarafı Davetlileri' :
      channel === 'masa-qr' ? 'Masa QR Kartı' :
      channel === 'owner' ? 'Yönetici / Sağdıç' : 'Davetli'
    );

    const record = ShareLinkRepository.create({
      weddingCode: wedding.code,
      shareType,
      channel,
      sharedByName: giverName,
      sharedByRole: giverRole,
      sharedToName: recipientName
    });

    const updatedShares = ShareLinkRepository.listByWedding(wedding.code);
    set({ shareLinks: updatedShares });

    const trackedUrl = LinkEngine.buildTrackedUrl({
      weddingCode: wedding.code,
      channel,
      shareType,
      sharedBy: giverName,
      sharedTo: recipientName,
      shareTokenId: record.id
    });

    return { record, trackedUrl };
  },

  revokeShareRecord: (shareId) => {
    if (!get().requirePermission('canShareLinks', 'davet bağlantısını iptal etme')) return;
    const wedding = get().wedding;
    if (!wedding) return;
    ShareLinkRepository.revoke(shareId);
    set({ shareLinks: ShareLinkRepository.listByWedding(wedding.code) });
    get().toast('Paylaşım bağlantısı iptal edildi.');
  },

  updatePasscodes: ({ ownerPasscode, guestPasscode }) => {
    if (!get().guardSecurityInput({ ownerPasscode, guestPasscode })) return;
    if (!get().requirePermission('canManageSettings', 'şifre güvenliğini güncelleme')) return;
    const current = get().wedding;
    if (!current) return;
    const updated = WeddingRepository.updatePasscodes(current.code, { ownerPasscode, guestPasscode });
    if (updated) {
      set({ wedding: { ...updated } });
      if (typeof fetch !== 'undefined') {
        fetch(`/api/v1/weddings/${encodeURIComponent(current.code)}/passcode`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner_passcode: updated.ownerPasscode,
            guest_passcode: updated.guestPasscode
          })
        }).catch(() => {});
      }
      get().toast('Düğün şifreleri başarıyla güncellendi.');
    }
  },

  // Davetli Girişi (Guest Join — records who gave the link/QR, to whom, and when)
  // Note: If the guest was promoted to Yetkili Üye / Sağdıç in wedding_members, they automatically receive their elevated role!
  joinAsGuest: ({ name, pin, phone, code, consentKvkk, consentLiab }) => {
    if (!get().guardSecurityInput({ name, pin, phone, code })) return false;
    if (!name?.trim()) { get().toast('Lütfen adınızı ve soyadınızı giriniz.'); return false; }
    if (!pin?.trim()) { get().toast('Lütfen düğün giriş şifresini giriniz.'); return false; }
    if (!consentKvkk || !consentLiab) { get().toast('Lütfen KVKK ve sorumluluk onaylarını işaretleyiniz.'); return false; }

    const targetCode = code?.trim() || get().wedding?.code;
    if (!targetCode) {
      get().toast('Lütfen düğün kodunu veya adını giriniz.');
      return false;
    }
    const wedding = WeddingRepository.findByCodeOrSlug(targetCode);
    if (!wedding) {
      get().toast('Bu kod veya isimle aktif bir düğün bulunamadı. Düğün yöneticisiyseniz "Yönetim → Kayıt Ol" sekmesinden düğünü başlatabilirsiniz.');
      return false;
    }

    const existingMember = MemberRepository.findByNameOrNick(wedding.code, name.trim());
    const isGuestPinOk = WeddingRepository.verifyGuestPassword(wedding, pin);
    const isMemberPinOk = existingMember && existingMember.customPin && existingMember.customPin === pin.trim();

    if (!isGuestPinOk && !isMemberPinOk) {
      SecurityVault.recordPinFailure('guest_pin_mismatch');
      get().toast('Hatalı düğün şifresi. Lütfen doğru şifreyi giriniz.');
      return false;
    }
    SecurityVault.resetPinFailures();

    const nick = existingMember?.nick || SecurityVault.generateNickname(name);
    const refChannel = get().incomingRef || 'direkt';
    const sharedBy = get().incomingSharedBy || (
      refChannel === 'gelin' ? 'Gelin Davetiyesi' :
      refChannel === 'damat' ? 'Damat Davetiyesi' :
      refChannel === 'masa-qr' ? 'Masa QR Kartı' : 'Doğrudan Giriş'
    );
    const shareTokenId = get().incomingShareTokenId || '';

    if (shareTokenId) {
      ShareLinkRepository.recordJoin(shareTokenId, name.trim());
    }

    const attendee = AttendanceRepository.recordEntry({
      weddingCode: wedding.code,
      name: name.trim(),
      nick,
      ref: refChannel,
      sharedBy,
      shareTokenId,
      phone: phone?.trim() || ''
    });

    // Register or preserve member role in RBAC table
    const assignedRole = existingMember && existingMember.role !== 'guest' ? existingMember.role : 'guest';
    const memberEntry = MemberRepository.upsertMember({
      weddingCode: wedding.code,
      personName: name.trim(),
      nick,
      phone: phone?.trim() || '',
      role: assignedRole,
      assignedBy: existingMember?.assignedBy || sharedBy
    });

    if (typeof fetch !== 'undefined') {
      fetch(`/api/v1/weddings/${encodeURIComponent(wedding.code)}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone?.trim() || '',
          ref: refChannel,
          shared_by: sharedBy,
          share_token_id: shareTokenId,
          consent_given: true
        })
      }).catch(() => {});
    }

    const isPromotedManager = SecurityVault.isManagerRole(memberEntry.role, memberEntry);
    const userSession = SecurityVault.setSession({
      id: attendee.id,
      name: name.trim(),
      nick,
      phone: phone?.trim() || '',
      role: memberEntry.role,
      roleTitle: memberEntry.roleTitle,
      permissions: {
        canManageSettings: memberEntry.canManageSettings,
        canAssignRoles: memberEntry.canAssignRoles,
        canModeratePhotos: memberEntry.canModeratePhotos,
        canShareLinks: memberEntry.canShareLinks,
        canPrintExport: memberEntry.canPrintExport,
        canUpload: memberEntry.canUpload
      },
      weddingCode: wedding.code,
      weddingName: wedding.name,
      sharedBy,
      shareTokenId,
      status: 'active'
    });

    const photos = PhotoRepository.listByWedding(wedding.code);
    const attendees = AttendanceRepository.listByWedding(wedding.code);
    const members = MemberRepository.listByWedding(wedding.code);
    const shareLinks = ShareLinkRepository.listByWedding(wedding.code);

    set({
      user: userSession,
      sessionHistory: SecurityVault.getSessionHistory(),
      isSwitchingAccount: false,
      wedding,
      photos,
      attendees,
      members,
      shareLinks,
      activeScreen: isPromotedManager ? 'OWNER_PANEL' : 'INVITEE_PANEL'
      shareLinks
    });
    get().navigate(isPromotedManager ? 'OWNER_PANEL' : 'INVITEE_PANEL');

    get().toast(
      isPromotedManager
        ? `Hoş geldiniz ${userSession.name} · ${userSession.roleTitle} yetkisiyle giriş yapıldı.`
        : `Giriş yapıldı · Hoş geldiniz @${nick}`
    );
    return true;
  },

  // Update guest phone & notification preference inside InviteePanel (UC-6, UC-11.1, UC-19, UC-43)
  saveGuestNotificationPreference: (phone) => {
    const user = get().user;
    const wedding = get().wedding;
    if (!user || !wedding) return;

    const cleanPhone = (phone || '').trim();
    if (!cleanPhone) {
      get().toast('Lütfen geçerli bir telefon numarası giriniz.');
      return;
    }

    const updatedUser = { ...user, phone: cleanPhone, notifyEnabled: true };
    SecurityVault.setSession(updatedUser);
    AttendanceRepository.recordEntry({
      weddingCode: wedding.code,
      name: user.name,
      nick: user.nick,
      ref: get().incomingRef || 'direkt',
      phone: cleanPhone
    });

    set({
      user: updatedUser,
      attendees: AttendanceRepository.listByWedding(wedding.code),
      isGuestNotifyOpen: false
    });
    get().toast(`Bildirim tercihiniz kaydedildi (${cleanPhone}). Fotoğraflarınız eşleştiğinde haber verilecek.`);
  },

  // Düğün Sahibi (Gelin / Damat), Sağdıç, Fotoğrafçı & Yetkili Üye Girişi (Mevcut Düğüne Giriş)
  loginAsManager: ({ code, name, role, passcode, phone, consentKvkk, consentLiab }) => {
    if (!get().guardSecurityInput({ code, name, role, passcode, phone })) return false;
    if (!code?.trim()) { get().toast('Lütfen düğün adını veya kodunu giriniz.'); return false; }
    if (!passcode?.trim()) { get().toast('Lütfen yönetici şifresini giriniz.'); return false; }
    if (consentKvkk === false || consentLiab === false) {
      get().toast('Lütfen KVKK ve sorumluluk onaylarını işaretleyiniz.');
      return false;
    }

    const wedding = WeddingRepository.findByCodeOrSlug(code);
    if (!wedding) {
      get().toast('Bu kodla düğün bulunamadı. İlk kez kuruyorsanız "Kayıt Ol · Düğün Kur" sekmesini kullanınız.');
      return false;
    }

    const cleanName = (name || '').trim();
    const matchedMember = cleanName ? MemberRepository.findByNameOrNick(wedding.code, cleanName) : null;

    const isOwnerPinMatch = WeddingRepository.verifyOwnerPassword(wedding, passcode);
    const isPromotedMemberMatch = matchedMember && SecurityVault.isManagerRole(matchedMember.role, matchedMember) && (
      (matchedMember.customPin && matchedMember.customPin === passcode.trim()) ||
      WeddingRepository.verifyGuestPassword(wedding, passcode)
    );

    if (!isOwnerPinMatch && !isPromotedMemberMatch) {
      SecurityVault.recordPinFailure('manager_pin_mismatch');
      get().toast('Hatalı yönetici şifresi veya bu isimle tanımlı yönetim yetkisi bulunamadı.');
      return false;
    }
    SecurityVault.resetPinFailures();

    // Disambiguate individual person name ("Ben Emre miyim Ayşe miyim?"):
    let resolvedRole = role || matchedMember?.role || wedding.ownerRole || 'groom_owner';
    let resolvedName = cleanName || matchedMember?.personName || '';
    if (!resolvedName) {
      if (resolvedRole === 'bride_owner') {
        resolvedName = wedding.brideName || (wedding.name.includes('&') ? wedding.name.split('&')[0].trim() : wedding.ownerName);
      } else if (resolvedRole === 'groom_owner') {
        resolvedName = wedding.groomName || (wedding.name.includes('&') ? wedding.name.split('&')[1].trim() : wedding.ownerName);
      } else {
        resolvedName = wedding.ownerName || 'Mehmet Yılmaz';
      }
    }

    // If a promoted member logged in with their member credentials (not master owner PIN), enforce their exact RBAC role
    if (isPromotedMemberMatch && !isOwnerPinMatch && matchedMember) {
      resolvedRole = matchedMember.role;
      resolvedName = matchedMember.personName;
    }

    const memberRecord = MemberRepository.upsertMember({
      weddingCode: wedding.code,
      personName: resolvedName,
      phone: phone?.trim() || matchedMember?.phone || '',
      role: resolvedRole,
      customPin: passcode.trim(),
      assignedBy: matchedMember?.assignedBy || 'Kurucu'
    });

    const managerSession = SecurityVault.setSession({
      id: memberRecord?.id || SecurityVault.generateUUID(),
      name: resolvedName,
      nick: memberRecord?.nick || SecurityVault.generateNickname(resolvedName),
      role: resolvedRole,
      roleTitle: memberRecord?.roleTitle || SecurityVault.getRoleTitle(resolvedRole),
      permissions: {
        canManageSettings: memberRecord.canManageSettings,
        canAssignRoles: memberRecord.canAssignRoles,
        canModeratePhotos: memberRecord.canModeratePhotos,
        canShareLinks: memberRecord.canShareLinks,
        canPrintExport: memberRecord.canPrintExport,
        canUpload: memberRecord.canUpload
      },
      weddingCode: wedding.code,
      weddingName: wedding.name,
      phone: phone?.trim() || '',
      status: 'verified'
    });

    if (typeof fetch !== 'undefined') {
      fetch(`/api/v1/weddings/${encodeURIComponent(wedding.code)}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode: passcode.trim(),
          name: resolvedName,
          role: resolvedRole
        })
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.member_token) {
            const updatedSession = SecurityVault.setSession({
              ...get().user,
              memberToken: data.member_token
            });
            set({ user: updatedSession });
          }
        })
        .catch(() => {});
    }

    const photos = PhotoRepository.listByWedding(wedding.code);
    const attendees = AttendanceRepository.listByWedding(wedding.code);
    const members = MemberRepository.listByWedding(wedding.code);
    const shareLinks = ShareLinkRepository.listByWedding(wedding.code);

    set({
      user: managerSession,
      sessionHistory: SecurityVault.getSessionHistory(),
      isSwitchingAccount: false,
      wedding,
      photos,
      attendees,
      members,
      shareLinks,
      activeScreen: 'OWNER_PANEL'
      shareLinks
    });
    get().navigate('OWNER_PANEL');

    get().toast(`Hoş geldiniz ${resolvedName} (${managerSession.roleTitle}) · ${wedding.name} yönetim panelindesiniz.`);
    return true;
  },

  // Owner Link Password Verification (AuthModal üzerinden)
  verifyOwnerPin: (passcode, customName, customRole = 'groom_owner') => {
    if (!get().guardSecurityInput({ passcode, customName, customRole })) return;
    const wedding = get().wedding;
    if (!wedding) return;

    const matchedMember = customName?.trim() ? MemberRepository.findByNameOrNick(wedding.code, customName.trim()) : null;
    const isOwnerPinOk = WeddingRepository.verifyOwnerPassword(wedding, passcode);
    const isMemberPinOk = matchedMember && SecurityVault.isManagerRole(matchedMember.role, matchedMember) && matchedMember.customPin === (passcode || '').trim();

    if (!isOwnerPinOk && !isMemberPinOk) {
      SecurityVault.recordPinFailure('auth_modal_pin_mismatch');
      get().toast('Hatalı yönetici şifresi.');
      return;
    }
    SecurityVault.resetPinFailures();

    const managerRole = (isMemberPinOk && !isOwnerPinOk) ? matchedMember.role : (customRole || wedding.ownerRole || 'groom_owner');
    const managerName = customName?.trim() || matchedMember?.personName || wedding.ownerName || 'Mehmet Yılmaz';

    const memberRecord = MemberRepository.upsertMember({
      weddingCode: wedding.code,
      personName: managerName,
      role: managerRole,
      customPin: (passcode || '').trim(),
      assignedBy: 'Kurucu'
    });

    const managerSession = SecurityVault.setSession({
      id: memberRecord?.id || SecurityVault.generateUUID(),
      name: managerName,
      nick: memberRecord?.nick || SecurityVault.generateNickname(managerName),
      role: managerRole,
      roleTitle: memberRecord?.roleTitle || SecurityVault.getRoleTitle(managerRole),
      permissions: {
        canManageSettings: memberRecord.canManageSettings,
        canAssignRoles: memberRecord.canAssignRoles,
        canModeratePhotos: memberRecord.canModeratePhotos,
        canShareLinks: memberRecord.canShareLinks,
        canPrintExport: memberRecord.canPrintExport,
        canUpload: memberRecord.canUpload
      },
      weddingCode: wedding.code,
      weddingName: wedding.name,
      status: 'verified'
    });

    const photos = PhotoRepository.listByWedding(wedding.code);
    const attendees = AttendanceRepository.listByWedding(wedding.code);
    const members = MemberRepository.listByWedding(wedding.code);
    const shareLinks = ShareLinkRepository.listByWedding(wedding.code);

    set({
      user: managerSession,
      photos,
      attendees,
      members,
      shareLinks,
      isAuthModalOpen: false,
      activeScreen: 'OWNER_PANEL'
    });

    get().toast(`Hoş geldiniz ${managerName} (${managerSession.roleTitle}) · ${wedding.name} yönetim panelindesiniz.`);
  },

  // Sıfırdan Yönetici Kaydı ve Yeni Düğün Kurulumu
  createNewWedding: ({ name, date, managerName, managerRole, managerPhone, ownerPin, guestPin, consentKvkk, consentLiab }) => {
    if (!get().guardSecurityInput({ name, date, managerName, managerRole, managerPhone, ownerPin, guestPin })) return false;
    if (!managerName?.trim()) { get().toast('Lütfen kendi adınızı ve soyadınızı giriniz (ör. Mehmet Yılmaz).'); return false; }
    if (!name?.trim()) { get().toast('Lütfen düğün veya çift adını giriniz.'); return false; }
    if (!ownerPin?.trim()) { get().toast('Lütfen bir yönetici şifresi belirleyiniz.'); return false; }
    if (consentKvkk === false || consentLiab === false) {
      get().toast('Lütfen KVKK ve sorumluluk onaylarını işaretleyiniz.');
      return false;
    }

    const role = managerRole || 'groom_owner';
    const cleanOwnerPin = ownerPin.trim();
    const cleanGuestPin = guestPin?.trim() || cleanOwnerPin;

    const newWedding = WeddingRepository.create({
      name: name.trim(),
      date,
      ownerName: managerName.trim(),
      ownerRole: role,
      ownerPasscode: cleanOwnerPin,
      guestPasscode: cleanGuestPin
    });

    const memberRecord = MemberRepository.upsertMember({
      weddingCode: newWedding.code,
      personName: managerName.trim(),
      phone: managerPhone?.trim() || '',
      role,
      customPin: cleanOwnerPin,
      assignedBy: 'Kurucu'
    });

    const managerSession = SecurityVault.setSession({
      id: memberRecord?.id || SecurityVault.generateUUID(),
      name: managerName.trim(),
      nick: memberRecord?.nick || SecurityVault.generateNickname(managerName.trim()),
      role,
      roleTitle: memberRecord?.roleTitle || SecurityVault.getRoleTitle(role),
      permissions: {
        canManageSettings: memberRecord.canManageSettings,
        canAssignRoles: memberRecord.canAssignRoles,
        canModeratePhotos: memberRecord.canModeratePhotos,
        canShareLinks: memberRecord.canShareLinks,
        canPrintExport: memberRecord.canPrintExport,
        canUpload: memberRecord.canUpload
      },
      weddingCode: newWedding.code,
      weddingName: newWedding.name,
      phone: managerPhone?.trim() || '',
      status: 'verified'
    });

    const photos = PhotoRepository.listByWedding(newWedding.code);
    const attendees = AttendanceRepository.listByWedding(newWedding.code);
    const members = MemberRepository.listByWedding(newWedding.code);
    const shareLinks = ShareLinkRepository.listByWedding(newWedding.code);

    set({
      user: managerSession,
      sessionHistory: SecurityVault.getSessionHistory(),
      isSwitchingAccount: false,
      wedding: newWedding,
      photos,
      attendees,
      members,
      shareLinks,
      activeScreen: 'OWNER_PANEL'
      shareLinks
    });
    get().navigate('OWNER_PANEL');

    if (typeof fetch !== 'undefined') {
      fetch('/api/v1/weddings/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newWedding.code,
          name: newWedding.name,
          date: newWedding.date,
          owner_name: newWedding.ownerName,
          owner_role: newWedding.ownerRole,
          owner_passcode: newWedding.ownerPasscode,
          guest_passcode: newWedding.guestPasscode
        })
      }).catch(() => {});
    }

    get().toast(`Kayıt tamamlandı · Hoş geldiniz ${managerName.trim()}, ${newWedding.name} kuruldu.`);
    return true;
  },

  // ─── Doğrudan Fotoğraf Yükleme (Tekli veya Toplu Kabul Eder) + 2. Aşamada Toplu Foto / Anı Notu Önerisi ───
  uploadFiles: (files) => {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) return;

    const MAX_SINGLE_BATCH = 50;
    if (fileList.length > MAX_SINGLE_BATCH) {
      get().toast(`Tek seferde en fazla ${MAX_SINGLE_BATCH} fotoğraf seçebilirsiniz.`);
      return;
    }

    const wedding = get().wedding;
    const user = get().user;
    if (!wedding) return;

    set({ uploadProgress: 15 });

    let loaded = 0;
    const addedPhotos = [];
    const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    fileList.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        addedPhotos.push({
          id: SecurityVault.generateUUID(),
          weddingCode: wedding.code,
          uploaderName: user?.name || 'Davetli',
          uploaderNick: user?.nick || (user?.role === 'owner' ? 'dugun_sahibi' : 'davetli'),
          fileName: file.name,
          dataUrl: e.target.result,
          fileSize: file.size,
          caption: '',
          comments: [],
          tags: [],
          taggedPersons: [],
          isDeleted: false,
          deletedBy: null,
          deletedAt: null,
          uploadedAt: nowTime
        });
        loaded++;
        set({ uploadProgress: Math.round((loaded / fileList.length) * 100) });

        if (loaded === fileList.length) {
          PhotoRepository.addPhotos(addedPhotos);
          const updatedPhotos = PhotoRepository.listByWedding(wedding.code);

          set({
            photos: updatedPhotos,
            lastUploadedIds: addedPhotos.map(p => p.id),
            uploadProgress: null
          });

          get().toast(`${addedPhotos.length} fotoğraf galeriye yüklendi.`);
        }
      };
      reader.readAsDataURL(file);
    });
  },

  clearLastUploadedPrompt: () => set({ lastUploadedIds: [] }),

  // Fotoğrafın içine / altına anı notu (caption) veya yorum yazma
  savePhotoNote: (photoIds, { caption, commentText }) => {
    if (!get().guardSecurityInput({ caption, commentText })) return;
    const wedding = get().wedding;
    const user = get().user;
    if (!wedding) return;
    PhotoRepository.updateCaptionAndNote(photoIds, {
      caption,
      commentText,
      authorName: user?.name || (user?.nick ? `@${user.nick}` : 'Davetli')
    });
    set({ photos: PhotoRepository.listByWedding(wedding.code) });
    get().toast('Fotoğraf notu kaydedildi.');
  },

  // ─── UC-8 & UC-21: Tagging & Person Labeling ──────────────────
  addTagToPhoto: (photoIds, tagText, personName = '') => {
    if (!get().guardSecurityInput({ tagText, personName })) return;
    const wedding = get().wedding;
    if (!wedding) return;
    PhotoRepository.addTag(photoIds, tagText, personName);
    set({ photos: PhotoRepository.listByWedding(wedding.code) });
    get().toast('Etiket eklendi.');
  },

  removeTagFromPhoto: (photoId, tagText) => {
    const wedding = get().wedding;
    if (!wedding) return;
    PhotoRepository.removeTag(photoId, tagText);
    set({ photos: PhotoRepository.listByWedding(wedding.code) });
  },

  // Fotoğraf Seçimi & Toplu İşlemler
  toggleSelectPhoto: (photoId) => {
    set(state => {
      const exists = state.selectedPhotos.includes(photoId);
      const nextSelected = exists
        ? state.selectedPhotos.filter(id => id !== photoId)
        : [...state.selectedPhotos, photoId];
      return {
        selectedPhotos: nextSelected,
        isSelectionMode: nextSelected.length > 0 ? true : state.isSelectionMode
      };
    });
  },

  selectAllPhotos: () => {
    const allIds = get().photos.map(p => p.id);
    set({ selectedPhotos: allIds, isSelectionMode: true });
  },

  clearSelection: () => set({ selectedPhotos: [], isSelectionMode: false }),

  // Soft Delete Selected Photos (UC-7, UC-12, UC-37) — Protected by RBAC canModeratePhotos
  softDeleteSelectedPhotos: () => {
    if (!get().requirePermission('canModeratePhotos', 'fotoğraf gizleme (moderasyon)')) return;
    const selected = get().selectedPhotos;
    if (selected.length === 0) return;
    const wedding = get().wedding;
    const user = get().user;

    PhotoRepository.softDelete(selected, user?.name || 'Düğün Sahibi');
    const updatedPhotos = PhotoRepository.listByWedding(wedding.code);

    set({
      photos: updatedPhotos,
      selectedPhotos: [],
      isSelectionMode: false,
      lightboxPhotoId: null
    });

    get().toast(`${selected.length} fotoğraf gizlendi. Ayarlar → Arşiv bölümünde korunuyor.`);
  },

  // Restore Soft-Deleted Photos back to active gallery — Protected by RBAC canModeratePhotos
  restoreSelectedPhotos: (idsToRestore = null) => {
    if (!get().requirePermission('canModeratePhotos', 'arşivden fotoğraf geri yükleme')) return;
    const selected = idsToRestore || get().selectedPhotos;
    if (!selected || selected.length === 0) return;
    const wedding = get().wedding;

    PhotoRepository.restore(selected);
    const updatedPhotos = PhotoRepository.listByWedding(wedding.code);

    set({
      photos: updatedPhotos,
      selectedPhotos: []
    });

    get().toast(`${selected.length} fotoğraf tekrar yayına alındı.`);
  },

  // Download Selected Photos (UC-34, UC-35, UC-36)
  downloadSelectedPhotos: (idsOverride = null) => {
    const selected = idsOverride || get().selectedPhotos;
    if (!selected || selected.length === 0) return;
    const allPhotos = PhotoRepository.getAll();
    const targets = allPhotos.filter(p => selected.includes(p.id));

    targets.slice(0, 10).forEach(p => {
      const a = document.createElement('a');
      a.href = p.dataUrl;
      a.download = p.fileName || `${p.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    get().toast(`${targets.length} fotoğraf indiriliyor.`);
    if (!idsOverride) get().clearSelection();
  },

  // UC-13: Print Selected or Single Photo (High-Res Print Layout)
  printPhotos: (idsOverride = null) => {
    const selected = idsOverride || get().selectedPhotos;
    if (!selected || selected.length === 0) return;
    const allPhotos = PhotoRepository.getAll();
    const targets = allPhotos.filter(p => selected.includes(p.id));
    if (targets.length === 0) return;

    const weddingName = get().wedding?.name || 'Düğün Albümü';
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) {
      get().toast('Baskı penceresi hazırlandı.');
      return;
    }

    const imgsHtml = targets.map(p => `
      <div style="page-break-inside:avoid;margin-bottom:24px;text-align:center;border:0.5px solid #ddd;padding:16px;">
        <img src="${p.dataUrl}" style="max-width:100%;max-height:80vh;object-fit:contain;" />
        <div style="font-family:Georgia,serif;font-size:12px;color:#555;margin-top:8px;">
          ${weddingName} · @${p.uploaderNick} ${p.tags?.length ? '· #' + p.tags.join(' #') : ''}
        </div>
      </div>
    `).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>${weddingName} — Baskı (${targets.length} Fotoğraf)</title></head>
      <body style="margin:24px;background:#fff;" onload="window.print()">${imgsHtml}</body></html>`);
    w.document.close();
    get().toast(`${targets.length} fotoğraf baskı ekranına gönderildi.`);
  },

  // Attendees & Filter Actions
  setAttendeeFilter: (filter) => set({ attendeeFilter: filter }),
  setGuestFilter: (nick) => set({ guestFilter: nick }),

  logout: () => {
    set({
      sessionHistory: SecurityVault.getSessionHistory(),
      isSwitchingAccount: false,
      isOwnerSettingsOpen: false,
      isGuestNotifyOpen: false,
      isHierarchyOpen: false,
      lightboxPhotoId: null,
      activeScreen: 'ROLE_SELECT'
    });
    get().toast('Giriş ekranına dönüldü. Kayıtlı hesabınızla devam edebilir veya başka hesaba geçebilirsiniz.');
  }
}));

// Listen to hashchange and popstate so LinkEngine reacts immediately when URL changes
// Listen to popstate so the browser's native Back/Forward buttons switch screens cleanly
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    useAppStore.getState().bootstrap();
  window.addEventListener('popstate', (e) => {
    const st = e.state;
    if (st && st.fyScreen) {
      useAppStore.getState().navigate(st.fyScreen, { fromPopState: true });
      return;
    }
    const hVal = (window.location.hash || '').replace(/^#/, '');
    if (hVal === 'giris') {
      useAppStore.getState().navigate('ROLE_SELECT', { fromPopState: true });
    } else if (hVal.endsWith('/baglantilar') || hVal === 'baglantilar') {
      useAppStore.getState().navigate('LINK_SHARE', { fromPopState: true });
    } else if (hVal.endsWith('/yonetim') || hVal === 'yonetim') {
      useAppStore.getState().navigate('OWNER_PANEL', { fromPopState: true });
    } else if (hVal.endsWith('/galeri') || hVal === 'galeri') {
      useAppStore.getState().navigate('INVITEE_PANEL', { fromPopState: true });
    } else {
      useAppStore.getState().bootstrap();
    }
  });
  window.addEventListener('popstate', () => {
    useAppStore.getState().bootstrap();
  });
}

// Granular Zustand Hook with selector equality check (prevents unnecessary re-renders)
export function useStore(selector = (s) => s, equalityFn = shallowEqual) {
  const [, forceUpdate] = reactUseState({});
  const selectorRef = reactUseRef(selector);
  const equalityRef = reactUseRef(equalityFn);
  const sliceRef = reactUseRef(selector(useAppStore.getState()));

  selectorRef.current = selector;
  equalityRef.current = equalityFn;
  sliceRef.current = selector(useAppStore.getState());

  reactUseEffect(() => {
    return useAppStore.subscribe((nextState) => {
      const nextSlice = selectorRef.current(nextState);
      if (!equalityRef.current(sliceRef.current, nextSlice)) {
        sliceRef.current = nextSlice;
        forceUpdate({});
      }
    });
  }, []);

  return sliceRef.current;
}
