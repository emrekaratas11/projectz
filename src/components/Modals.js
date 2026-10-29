import { h, useState, useRef } from '../react.js';
import { useStore, useAppStore } from '../store/index.js';
import { WeddingRepository, PhotoRepository, AttendanceRepository, MemberRepository } from '../services/repositories.js';
import { SecurityVault } from '../services/security.js';

// ─── 1. Yönetici Doğrulama Modalı (P1 — URL ile yönetim girişi, Uncontrolled FormData) ──────
export function AuthModal() {
  const { isAuthModalOpen, wedding } = useStore(s => ({
    isAuthModalOpen: s.isAuthModalOpen,
    wedding: s.wedding
  }));

  if (!isAuthModalOpen) return null;

  const onSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    useAppStore.getState().verifyOwnerPin(
      String(fd.get('pin') || ''),
      String(fd.get('customName') || ''),
      String(fd.get('customRole') || 'groom_owner')
    );
  };

  return h('div', { className: 'auth-modal-overlay' },
    h('div', { className: 'auth-modal-card' },
      h('div', { className: 'auth-modal-gold-line' }),
      h('div', { className: 'auth-modal-title' }, 'Yönetici Doğrulaması'),
      h('div', { className: 'auth-modal-sub' }, wedding?.name || 'Düğün Yönetimi'),
      h('p', { className: 'auth-modal-text mb-4' }, `${wedding?.name || 'Düğün'} yönetim paneline erişmek için bireysel kimliğinizi ve şifrenizi giriniz.`),
      h('form', { onSubmit },
        h('div', { className: 'input-group mb-4' },
          h('label', { className: 'input-label' }, 'kişisel adınız soyadınız'),
          h('input', {
            className: 'input-field',
            name: 'customName',
            type: 'text',
            placeholder: 'ör. Mehmet Yılmaz veya Ayşe Kaya',
            defaultValue: ''
          })
        ),
        h('div', { className: 'input-group mb-4' },
          h('label', { className: 'input-label' }, 'görev ve sorumluluk rolünüz'),
          h('select', {
            className: 'input-field',
            name: 'customRole',
            defaultValue: 'groom_owner'
          },
            h('option', { value: 'groom_owner' }, 'Düğün Sahibi · Damat'),
            h('option', { value: 'bride_owner' }, 'Düğün Sahibi · Gelin'),
            h('option', { value: 'member_manager' }, 'Yetkili Üye · Galeri Moderatörü'),
            h('option', { value: 'bestman' }, 'Sağdıç / Nedime · Yardımcı'),
            h('option', { value: 'photographer' }, 'Düğün Fotoğrafçısı')
          )
        ),
        h('div', { className: 'input-group mb-6' },
          h('label', { className: 'input-label' }, 'yönetici şifresi'),
          h('input', {
            className: 'input-field',
            name: 'pin',
            type: 'password',
            placeholder: '••••',
            defaultValue: '',
            required: true,
            autoFocus: true
          })
        ),
        h('div', { style: { display: 'flex', gap: 'var(--sp-3)' } },
          h('button', {
            type: 'button',
            className: 'btn btn-ghost btn-full',
            onClick: () => useAppStore.getState().closeAuthModal()
          }, 'Vazgeç'),
          h('button', { type: 'submit', className: 'btn btn-primary btn-full' }, 'Giriş Yap')
        )
      )
    )
  );
}

// ─── 2. KVKK & Sorumluluk Yasal Metin Modalı (P2) ──────────────────
export function LegalModal() {
  const { isLegalModalOpen, legalModalType } = useStore(s => ({
    isLegalModalOpen: s.isLegalModalOpen,
    legalModalType: s.legalModalType
  }));
  if (!isLegalModalOpen) return null;

  const isKvkk = legalModalType === 'kvkk';

  return h('div', { className: 'legal-modal-overlay open' },
    h('div', { className: 'legal-modal' },
      h('div', { className: 'legal-modal-header' },
        h('div', { className: 'legal-modal-title' }, isKvkk ? 'KVKK Aydınlatma Metni' : 'Kullanıcı Sorumluluk Beyanı'),
        h('button', {
          type: 'button',
          className: 'legal-modal-close',
          onClick: () => useAppStore.getState().closeLegalModal()
        }, '×')
      ),
      h('div', { className: 'legal-modal-body' },
        isKvkk ? h('div', null,
          h('h4', null, '1. Veri Sorumlusu ve Kapsam'),
          h('p', null, '6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, bu platform üzerinde paylaştığınız fotoğraflar ve kullanıcı adı bilgileri yalnızca ilgili etkinlik kapsamında davetliler ve düğün sahipleriyle paylaşılmak amacıyla işlenmektedir.'),
          h('h4', null, '2. Verilerin Korunması ve Silinme Hakkı'),
          h('p', null, 'Verileriniz üçüncü şahıslarla reklam veya pazarlama amacıyla paylaşılmaz. Düğün yöneticileri veya fotoğraf sahipleri diledikleri an fotoğrafların galeriden gizlenmesini (soft-delete) talep edebilir.')
        ) : h('div', null,
          h('h4', null, '1. Yer Sağlayıcı Statüsü (5651 Sayılı Kanun)'),
          h('p', null, '5651 sayılı İnternet Ortamında Yapılan Yayınların Düzenlenmesi Hakkında Kanun uyarınca platform yalnızca teknik altyapı sunan "Yer Sağlayıcı" konumundadır.'),
          h('h4', null, '2. Kullanıcı Sorumluluğu'),
          h('p', null, 'Platforma yüklenen tüm fotoğrafların telif, kişilik hakları, özel hayatın gizliliği ve yasal sorumluluğu münhasıran içeriği yükleyen kullanıcıya aittir.')
        )
      ),
      h('div', { className: 'legal-modal-footer' },
        h('button', {
          type: 'button',
          className: 'btn btn-primary btn-sm',
          onClick: () => useAppStore.getState().closeLegalModal()
        }, 'Anladım ve Kabul Ediyorum')
      )
    )
  );
}

// ─── 3. Tam Ekran Fotoğraf İzleme & Doğrudan Üzerine Anı Notu Yazma (PhotoLightboxModal) ──
// Form ve hashtag kutuları olmadan; fotoğraf geniş ekranda izlenir ve hemen altındaki
// el yazısı satırına tıklanarak doğrudan içine/altına anı yazısı yazılır (uncontrolled ref ile sıfır göz kırpma).
export function PhotoLightboxModal() {
  const { lightboxPhotoId, photos, user, wedding } = useStore(s => ({
    lightboxPhotoId: s.lightboxPhotoId,
    photos: s.photos,
    user: s.user,
    wedding: s.wedding
  }));
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const captionInputRef = useRef(null);

  if (!lightboxPhotoId) return null;

  const allPhotos = PhotoRepository.getAll();
  const photo = allPhotos.find(p => p.id === lightboxPhotoId);
  if (!photo) return null;

  const isManager = user?.role === 'owner' || user?.role === 'bestman' || user?.role === 'photographer';

  // Fotoğraflar arasında ileri / geri gezinme
  const activeList = photos || [];
  const currentIndex = activeList.findIndex(p => p.id === photo.id);
  const prevPhoto = currentIndex > 0 ? activeList[currentIndex - 1] : null;
  const nextPhoto = currentIndex >= 0 && currentIndex < activeList.length - 1 ? activeList[currentIndex + 1] : null;

  const isEditing = editingPhotoId === photo.id;

  const startInlineEdit = () => {
    setEditingPhotoId(photo.id);
  };

  const commitInlineEdit = (val) => {
    if (editingPhotoId === photo.id) {
      const text = val !== undefined ? val : (captionInputRef.current ? captionInputRef.current.value : '');
      useAppStore.getState().savePhotoNote([photo.id], { caption: text });
      setEditingPhotoId(null);
    }
  };

  return h('div', {
    className: 'legal-modal-overlay open',
    onClick: (e) => {
      if (e.target === e.currentTarget) useAppStore.getState().closeLightbox();
    }
  },
    h('div', {
      className: 'legal-modal',
      style: {
        maxWidth: '92vw',
        width: '1080px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column'
      }
    },
      h('div', { className: 'legal-modal-header' },
        h('div', null,
          h('div', { className: 'legal-modal-title' }, `@${photo.uploaderNick}`),
          h('div', { className: 't-xs t-muted' }, `${photo.uploaderName || 'Davetli'} · ${photo.uploadedAt || ''}`)
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
          prevPhoto && h('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            onClick: () => { setEditingPhotoId(null); useAppStore.getState().openLightbox(prevPhoto.id); }
          }, '← önceki'),
          nextPhoto && h('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            onClick: () => { setEditingPhotoId(null); useAppStore.getState().openLightbox(nextPhoto.id); }
          }, 'sonraki →'),
          h('button', {
            type: 'button',
            className: 'legal-modal-close',
            onClick: () => useAppStore.getState().closeLightbox()
          }, '×')
        )
        h('button', {
          type: 'button',
          className: 'legal-modal-close',
          onClick: () => useAppStore.getState().closeLightbox()
        }, '×')
      ),
      h('div', {
        className: 'legal-modal-body',
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--sp-4)',
          background: 'var(--off-white)'
        }
      },
        // Geniş Tam Ekran Fotoğraf İzleme
        h('img', {
          src: photo.dataUrl,
          alt: photo.fileName,
          style: {
            width: '100%',
            maxHeight: '68vh',
            objectFit: 'contain',
            display: 'block',
            borderRadius: 'var(--r-sm)'
          }
        }),

        // Form Olmadan Doğrudan Fotoğrafın Altında El Yazısı Not Satırı (Tıkla & Yaz — Sıfır Re-render)
        h('div', {
          style: {
            width: '100%',
            maxWidth: '640px',
            marginTop: 'var(--sp-4)',
            textAlign: 'center'
          }
        },
          isEditing
            ? h('input', {
                ref: captionInputRef,
                key: `caption-edit-${photo.id}`,
                type: 'text',
                defaultValue: photo.caption || '',
                placeholder: 'bu kareye bir anı yazısı bırakın ve Enter\'a basın...',
                autoFocus: true,
                onBlur: (e) => commitInlineEdit(e.currentTarget.value),
                onKeyDown: (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInlineEdit(e.currentTarget.value);
                  }
                  if (e.key === 'Escape') {
                    setEditingPhotoId(null);
                  }
                },
                style: {
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--gold)',
                  fontFamily: 'var(--font-hand)',
                  fontSize: '1.5rem',
                  color: 'var(--ink)',
                  textAlign: 'center',
                  outline: 'none',
                  padding: '4px 8px'
                }
              })
            : h('div', {
                onClick: startInlineEdit,
                title: 'Yazıyı düzenlemek için tıklayın',
                style: {
                  cursor: 'text',
                  fontFamily: photo.caption ? 'var(--font-hand)' : 'var(--font-body)',
                  fontSize: photo.caption ? '1.5rem' : 'var(--fs-xs)',
                  color: photo.caption ? 'var(--ink)' : 'var(--ink-muted)',
                  fontStyle: photo.caption ? 'normal' : 'italic',
                  padding: '4px 12px',
                  borderBottom: '0.5px dashed transparent'
                }
              }, photo.caption ? `"${photo.caption}"` : 'fotoğrafın içine bir anı yazısı eklemek için buraya dokunun...')
        )
      ),

      // Alt Aksiyon Çubuğu: İndir, Yazdır, Gizle
      h('div', {
        className: 'legal-modal-footer',
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-2)' }
      },
        h('div', { style: { display: 'flex', gap: 'var(--sp-2)' } },
          h('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            onClick: () => useAppStore.getState().downloadSelectedPhotos([photo.id])
          }, 'İndir'),
          h('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            onClick: () => useAppStore.getState().printPhotos([photo.id])
          }, 'Yazdır')
        ),
        isManager && !photo.isDeleted && h('button', {
          type: 'button',
          className: 'btn btn-ghost btn-sm',
          style: { color: '#c0392b' },
          onClick: () => {
            PhotoRepository.softDelete([photo.id], user?.name || 'Yönetici');
            useAppStore.getState().closeLightbox();
            useAppStore.setState({ photos: PhotoRepository.listByWedding(wedding?.code) });
            useAppStore.getState().toast('Fotoğraf galeriden gizlendi (Ayarlar → Arşiv altında korunuyor).');
          }
        }, 'Galeriden Gizle')
      )
    )
  );
}

// ─── 4. Yönetici Ayarlar, Galeri İzinleri, Güvenlik & Arşiv Çekmecesi (P2 — OwnerSettingsSheet) ─────
export function OwnerSettingsSheet() {
  const { isOwnerSettingsOpen, wedding, user, sessionHistory, photos } = useStore(s => ({
    isOwnerSettingsOpen: s.isOwnerSettingsOpen,
    wedding: s.wedding,
    user: s.user,
    sessionHistory: s.sessionHistory,
    photos: s.photos
  }));
  const [showPins, setShowPins] = useState(false);
  const bestmanInputRef = useRef(null);

  if (!isOwnerSettingsOpen) return null;

  const archivedPhotos = PhotoRepository.listArchivedByWedding(wedding?.code);
  const allWeddings = WeddingRepository.getAll();
  const historyList = sessionHistory || [];

  const onSaveGeneralSettings = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    useAppStore.getState().updateWeddingSettings({
      name: String(fd.get('wName') || ''),
      date: String(fd.get('wDate') || ''),
      venue: String(fd.get('wVenue') || ''),
      welcomeNote: String(fd.get('wWelcome') || ''),
      allowGuestUploads: fd.get('allowUploads') === 'on',
      allowGuestDownloads: fd.get('allowDownloads') === 'on',
      moderationMode: String(fd.get('moderationMode') || 'auto'),
      watermarkOnPrint: fd.get('watermarkOnPrint') === 'on'
    });
  };

  const onSavePins = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    useAppStore.getState().updatePasscodes({
      ownerPasscode: String(fd.get('ownerPin') || '1234'),
      guestPasscode: String(fd.get('guestPin') || '1234')
    });
  };

  const onCopyBestmanLink = () => {
    const bestmanName = bestmanInputRef.current ? bestmanInputRef.current.value : '';
    const res = useAppStore.getState().createShareRecord({
      channel: 'owner',
      shareType: 'link',
      sharedByName: user?.name || wedding?.ownerName || 'Düğün Sahibi',
      sharedToName: bestmanName.trim() || 'Sağdıç / Yardımcı Yönetici'
    });
    if (res && navigator.clipboard) {
      navigator.clipboard.writeText(res.trackedUrl);
      useAppStore.getState().toast(`Yardımcı yönetici bağlantısı kopyalandı (${res.record.sharedToName}).`);
    } else if (res) {
      useAppStore.getState().toast(`Yardımcı yönetici bağlantısı üretildi: ${res.trackedUrl}`);
    }
  };

  return h('div', {
    className: 'legal-modal-overlay open',
    onClick: (e) => {
      if (e.target === e.currentTarget) useAppStore.getState().closeOwnerSettings();
    }
  },
    h('div', { className: 'legal-modal', style: { maxWidth: '680px' } },
      h('div', { className: 'legal-modal-header' },
        h('div', null,
          h('div', { className: 'legal-modal-title' }, 'Düğün Ayarları, İzinler & Arşiv'),
          h('div', { className: 't-xs t-muted' }, `${wedding?.name || 'Düğün'} · Kod: ${wedding?.code || '-'}`)
        ),
        h('button', {
          type: 'button',
          className: 'legal-modal-close',
          onClick: () => useAppStore.getState().closeOwnerSettings()
        }, '×')
      ),
      h('div', { className: 'legal-modal-body' },
        // Bölüm 1: Düğün Kimliği, Karşılama Notu & Galeri İzinleri (Uncontrolled FormData — 0 re-render)
        h('div', { className: 'hierarchy-section', style: { marginTop: 0, paddingTop: 0, borderTop: 'none' } },
          h('div', { className: 'manager-line-role mb-3' }, '1. düğün kimliği, galeri izinleri & baskı tercihleri'),
          h('form', { key: `settings-general-${wedding?.code || 'default'}`, onSubmit: onSaveGeneralSettings },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' } },
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'çift / düğün adı'),
                h('input', {
                  className: 'input-field',
                  name: 'wName',
                  type: 'text',
                  defaultValue: wedding?.name || ''
                })
              ),
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'etkinlik tarihi'),
                h('input', {
                  className: 'input-field',
                  name: 'wDate',
                  type: 'date',
                  defaultValue: wedding?.date || ''
                })
              )
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' } },
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'mekan / salon adı'),
                h('input', {
                  className: 'input-field',
                  name: 'wVenue',
                  type: 'text',
                  placeholder: 'ör. Çırağan Kempinski · İstanbul',
                  defaultValue: wedding?.venue || ''
                })
              ),
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'karşılama sözü (davetiye notu)'),
                h('input', {
                  className: 'input-field',
                  name: 'wWelcome',
                  type: 'text',
                  placeholder: 'çekilen her kare saklanır...',
                  defaultValue: wedding?.welcomeNote || ''
                })
              )
            ),
            h('div', {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--sp-3)',
                marginTop: 'var(--sp-3)',
                paddingTop: 'var(--sp-3)',
                borderTop: '0.5px solid var(--border-thin)'
              }
            },
              h('label', { className: 'consent-checkbox-wrap' },
                h('input', {
                  type: 'checkbox',
                  name: 'allowUploads',
                  className: 'consent-checkbox',
                  defaultChecked: wedding?.allowGuestUploads !== false
                }),
                h('span', { className: 'consent-text' }, 'Davetliler yeni fotoğraf yükleyebilsin (kapatılırsa albüm salt-okunur olur)')
              ),
              h('label', { className: 'consent-checkbox-wrap' },
                h('input', {
                  type: 'checkbox',
                  name: 'allowDownloads',
                  className: 'consent-checkbox',
                  defaultChecked: wedding?.allowGuestDownloads !== false
                }),
                h('span', { className: 'consent-text' }, 'Davetliler galerideki yüksek çözünürlüklü fotoğrafları indirebilsin')
              ),
              h('label', { className: 'consent-checkbox-wrap' },
                h('input', {
                  type: 'checkbox',
                  name: 'watermarkOnPrint',
                  className: 'consent-checkbox',
                  defaultChecked: wedding?.watermarkOnPrint !== false
                }),
                h('span', { className: 'consent-text' }, 'Baskı (yazdır) çıktılarında düğün adı ve el yazısı anı notu yer alsın')
              ),
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'yüklenecek fotoğrafların yayın modu'),
                h('select', {
                  className: 'input-field',
                  name: 'moderationMode',
                  defaultValue: wedding?.moderationMode || 'auto'
                },
                  h('option', { value: 'auto' }, 'Anında Yayınla (Otomatik)'),
                  h('option', { value: 'manual' }, 'Yönetici Onayıyla Yayınla')
                )
              )
            ),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-3)' } },
              h('button', { type: 'submit', className: 'resume-link resume-link--main' }, 'düğün ve izin ayarlarını kaydet')
            )
          )
        ),

        // Bölüm 2: Şifre Görüntüleme ve Güncelleme (UC-17)
        h('div', { className: 'hierarchy-section' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--sp-2)' } },
            h('span', { className: 'manager-line-role' }, '2. erişim & şifre güvenliği'),
            h('button', {
              type: 'button',
              className: 'resume-link',
              onClick: () => setShowPins(v => !v)
            }, showPins ? 'şifreleri gizle' : 'mevcut şifreleri göster')
          ),
          showPins && h('div', { className: 'manager-line-note mb-4', style: { color: 'var(--ink)' } },
            `Mevcut Yönetici Şifresi: ${wedding?.ownerPasscode || '1234'} · Mevcut Davetli Şifresi: ${wedding?.guestPasscode || '1234'}`
          ),
          h('form', { key: `settings-pins-${wedding?.code || 'default'}`, onSubmit: onSavePins },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' } },
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'yönetici şifresi'),
                h('input', {
                  className: 'input-field',
                  name: 'ownerPin',
                  type: 'text',
                  defaultValue: wedding?.ownerPasscode || '1234',
                  required: true
                })
              ),
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'davetli şifresi'),
                h('input', {
                  className: 'input-field',
                  name: 'guestPin',
                  type: 'text',
                  defaultValue: wedding?.guestPasscode || '1234',
                  required: true
                })
              )
            ),
            h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-3)' } },
              h('button', { type: 'submit', className: 'resume-link resume-link--main' }, 'şifreleri güncelle')
            )
          )
        ),

        // Bölüm 3: Görev ve Sorumluluk Tablosu — Üye / Sağdıç Yetkilendirme (UC-16 RBAC)
        h('div', { className: 'hierarchy-section' },
          h('div', { className: 'manager-line-role mb-2' }, '3. görev ve sorumluluk atama (üye / sağdıç yetkilendir)'),
          h('p', { className: 'manager-line-note mb-3' }, 'Düğündeki bir davetliyi "Yetkili Üye (Galeri Moderatörü)" veya "Sağdıç / Nedime" olarak atayabilir; kendi adı ve şifresiyle yönetim paneline girmesini sağlayabilirsiniz.'),
          h('form', {
            key: `assign-role-${wedding?.code || 'default'}`,
            onSubmit: (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const pName = String(fd.get('rPersonName') || '').trim();
              const rRole = String(fd.get('rRole') || 'member_manager');
              const rPin = String(fd.get('rPin') || '').trim();
              if (!pName) return;
              useAppStore.getState().assignMemberRole({
                personName: pName,
                role: rRole,
                customPin: rPin
              });
              e.currentTarget.reset();
            }
          },
            h('div', { style: { display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.8fr', gap: 'var(--sp-2)', alignItems: 'end' } },
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'yetkilendirilecek kişi adı'),
                h('input', {
                  ref: bestmanInputRef,
                  className: 'input-field',
                  name: 'rPersonName',
                  type: 'text',
                  placeholder: 'ör. Ahmet Yılmaz',
                  defaultValue: '',
                  required: true
                })
              ),
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'verilecek görev'),
                h('select', {
                  className: 'input-field',
                  name: 'rRole',
                  defaultValue: 'member_manager'
                },
                  h('option', { value: 'member_manager' }, 'Yetkili Üye · Moderatör'),
                  h('option', { value: 'bestman' }, 'Sağdıç / Nedime · Yardımcı'),
                  h('option', { value: 'photographer' }, 'Düğün Fotoğrafçısı'),
                  h('option', { value: 'bride_owner' }, 'Düğün Sahibi · Gelin'),
                  h('option', { value: 'groom_owner' }, 'Düğün Sahibi · Damat')
                )
              ),
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'özel şifre'),
                h('input', {
                  className: 'input-field',
                  name: 'rPin',
                  type: 'text',
                  placeholder: wedding?.ownerPasscode || '1234',
                  defaultValue: ''
                })
              )
            ),
            h('div', { className: 'resume-line-actions', style: { justifyContent: 'flex-end', marginTop: 'var(--sp-3)' } },
              h('button', { type: 'submit', className: 'resume-link resume-link--main' }, 'görev tablosuna kaydet'),
              h('span', { className: 'resume-sep' }, '·'),
              h('button', {
                type: 'button',
                className: 'resume-link',
                onClick: onCopyBestmanLink
              }, 'yetki davet linkini kopyala')
            )
          )
        ),

        // Bölüm 4: Önceki Rollerim, Geçmiş Düğünler & Geçmiş İşler Portföyü
        h('div', { className: 'hierarchy-section' },
          h('div', { className: 'manager-line-role mb-2' },
            `4. önceki rollerim, geçmiş düğünler & işler (${allWeddings.length} düğün)`
          ),
          h('p', { className: 'manager-line-note mb-3' },
            'Daha önce yönettiğiniz veya katıldığınız düğünlerin fotoğraflarına ve yönetim panellerine tek tıkla geçiş yapabilirsiniz.'
          ),
          allWeddings.map(w => {
            const wPhotos = PhotoRepository.listByWedding(w.code);
            const wGuests = AttendanceRepository.listByWedding(w.code);
            const isCurrent = w.code === wedding?.code;
            const histMatch = historyList.find(item => item.weddingCode === w.code);
            const roleText =
              (histMatch?.role || w.ownerRole) === 'photographer' ? 'Fotoğrafçı · Organizasyon' :
              (histMatch?.role || w.ownerRole) === 'bestman' ? 'Sağdıç · Yardımcı Yönetici' :
              (histMatch?.role || w.ownerRole) === 'guest' ? 'Davetli' :
              'Düğün Sahibi · Yönetici';

            return h('div', { key: w.id, className: 'guest-card' },
              h('div', { className: 'guest-card-left' },
                h('span', {
                  className: 'guest-card-name',
                  style: isCurrent ? { color: 'var(--gold)' } : null
                }, w.name),
                h('span', { className: 'guest-card-nick' },
                  `${roleText} · ${w.date || w.createdAt}${w.venue ? ' · ' + w.venue : ''} · ${wPhotos.length} fotoğraf · ${wGuests.length} davetli`
                )
              ),
              h('div', { className: 'resume-line-actions' },
                isCurrent
                  ? h('span', { className: 'manager-line-note', style: { color: 'var(--gold)' } }, 'şu an açık')
                  : h('button', {
                      type: 'button',
                      className: 'resume-link resume-link--main',
                      onClick: () => useAppStore.getState().switchToWeddingOrSession({
                        weddingCode: w.code,
                        role: histMatch?.role || w.ownerRole || 'owner',
                        name: histMatch?.name || w.ownerName
                      })
                    }, 'fotoğrafları & yönetimi aç →')
              )
            );
          })
        ),

        // Bölüm 5: Gizlenen Fotoğraflar Arşivi / Soft-Delete Kurtarma (UC-7)
        h('div', { className: 'hierarchy-section' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--sp-2)' } },
            h('span', { className: 'manager-line-role' },
              `5. gizlenen fotoğraflar arşivi (${archivedPhotos.length})`
            ),
            archivedPhotos.length > 0 && h('button', {
              type: 'button',
              className: 'resume-link resume-link--main',
              onClick: () => useAppStore.getState().restoreSelectedPhotos(archivedPhotos.map(p => p.id))
            }, 'tümünü geri yükle')
          ),
          h('p', { className: 'manager-line-note mb-3' }, 'Galeriden gizlenen fotoğraflar diskten silinmez; burada saklanır. İstediğiniz fotoğrafı tek tıkla tekrar yayına alabilirsiniz.'),
          archivedPhotos.length === 0
            ? h('div', { className: 't-xs t-muted t-italic t-center', style: { padding: 'var(--sp-4) 0' } }, 'arşivde gizlenmiş fotoğraf bulunmuyor')
            : h('div', { className: 'photo-grid cols-3', style: { gap: '6px', maxHeight: '220px', overflowY: 'auto' } },
                archivedPhotos.map(p => h('div', { key: p.id, className: 'photo-item', style: { position: 'relative' } },
                  h('img', { src: p.dataUrl, alt: p.fileName }),
                  h('button', {
                    type: 'button',
                    className: 'btn btn-primary btn-sm',
                    style: {
                      position: 'absolute',
                      bottom: '4px',
                      left: '4px',
                      right: '4px',
                      padding: '2px 4px',
                      fontSize: '10px'
                    },
                    onClick: () => useAppStore.getState().restoreSelectedPhotos([p.id])
                  }, 'Geri Yükle')
                ))
              )
        )
      ),
      h('div', { className: 'legal-modal-footer' },
        h('button', {
          type: 'button',
          className: 'resume-link resume-link--main',
          onClick: () => useAppStore.getState().closeOwnerSettings()
        }, 'kapat')
      )
    )
  );
}

// ─── 5. Davetli "Beni Bul / Bildirim Al" Çekmecesi (UC-6, UC-11.1, UC-19, UC-43) ──
export function GuestNotifySheet() {
  const { isGuestNotifyOpen, user } = useStore(s => ({
    isGuestNotifyOpen: s.isGuestNotifyOpen,
    user: s.user
  }));

  if (!isGuestNotifyOpen) return null;

  const onSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    useAppStore.getState().saveGuestNotificationPreference(String(fd.get('phone') || ''));
  };

  return h('div', { className: 'legal-modal-overlay open' },
    h('div', { className: 'legal-modal', style: { maxWidth: '460px' } },
      h('div', { className: 'legal-modal-header' },
        h('div', null,
          h('div', { className: 'legal-modal-title' }, 'Fotoğraflarım Yüklendiğinde Haber Ver'),
          h('div', { className: 't-xs t-muted' }, `@${user?.nick || 'davetli'} · Kişisel Bildirim Tercihi`)
        ),
        h('button', {
          type: 'button',
          className: 'legal-modal-close',
          onClick: () => useAppStore.getState().closeGuestNotify()
        }, '×')
      ),
      h('form', { onSubmit },
        h('div', { className: 'legal-modal-body' },
          h('p', { className: 't-sm mb-4' },
            'Düğün fotoğrafçısı veya diğer davetliler sizin yer aldığınız yeni kareler yüklediğinde ve isminiz etiketlendiğinde size bildirim gönderebilmemiz için telefon numaranızı kaydedebilirsiniz.'
          ),
          h('div', { className: 'input-group' },
            h('label', { className: 'input-label' }, 'cep telefonu numaranız'),
            h('input', {
              className: 'input-field',
              name: 'phone',
              type: 'tel',
              placeholder: '05xx xxx xx xx',
              defaultValue: user?.phone || '',
              required: true,
              autoFocus: true
            })
          )
        ),
        h('div', { className: 'legal-modal-footer', style: { display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-2)' } },
          h('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            onClick: () => useAppStore.getState().closeGuestNotify()
          }, 'Vazgeç'),
          h('button', { type: 'submit', className: 'btn btn-primary btn-sm' }, 'Bildirim Tercihimi Kaydet')
        )
      )
    )
  );
}

// ─── 6. Düğün Hiyerarşisi, Görev Tablosu (RBAC) & "Ben Kimim?" Kimlik Şeması (HierarchySheet) ──
export function HierarchySheet() {
  const { isHierarchyOpen, user, wedding, attendees, members, shareLinks, photos, sessionHistory } = useStore(s => ({
    isHierarchyOpen: s.isHierarchyOpen,
    user: s.user,
    wedding: s.wedding,
    attendees: s.attendees,
    members: s.members,
    shareLinks: s.shareLinks,
    photos: s.photos,
    sessionHistory: s.sessionHistory
  }));
  if (!isHierarchyOpen) return null;

  const attendeesList = attendees || [];
  const membersList = MemberRepository.listByWedding(wedding?.code);
  const sharesList = shareLinks || [];
  const photosList = photos || [];

  const isManager = SecurityVault.isManagerRole(user?.role, user?.permissions);
  const myRoleLabel = user?.roleTitle || SecurityVault.getRoleTitle(user?.role);
  const canAssignRoles = Boolean(user?.permissions?.canAssignRoles || user?.role === 'bride_owner' || user?.role === 'groom_owner' || user?.role === 'owner');

  const myAttendeeRecord = attendeesList.find(a => a.nick === user?.nick || a.name === user?.name);
  const perms = user?.permissions || SecurityVault.getDefaultPermissions(user?.role);
  const permSummary = [
    perms.canManageSettings ? 'düğün & şifre ayarları' : null,
    perms.canAssignRoles ? 'yetki atama' : null,
    perms.canModeratePhotos ? 'fotoğraf gizleme/kurtarma' : null,
    perms.canShareLinks ? 'davet linki & qr üretme' : null,
    perms.canPrintExport ? 'baskı & indirme' : null,
    perms.canUpload !== false ? 'fotoğraf yükleme' : null
  ].filter(Boolean).join(' · ');

  const myChannelNote = isManager
    ? `yetkileriniz: ${permSummary} · kriptografik oturum imzası aktif`
    : (
        (myAttendeeRecord?.refLabel || 'davetli olarak katıldı') +
        (myAttendeeRecord?.sharedBy || user?.sharedBy ? ` · davet eden: ${myAttendeeRecord?.sharedBy || user?.sharedBy}` : '')
      );

  const gelinGuests = attendeesList.filter(a => a.ref === 'gelin');
  const damatGuests = attendeesList.filter(a => a.ref === 'damat');
  const masaGuests = attendeesList.filter(a => a.ref === 'masa-qr' || a.ref === 'qr' || (!a.ref || a.ref === 'direkt'));

  // Sağdıç / yardımcı yönetici paylaşımları
  const managerShares = sharesList.filter(s => s.channel === 'owner' && !s.isRevoked);

  const renderGuestLine = (guest) => {
    const isMe = (user?.nick && guest.nick === user.nick) || (user?.name && guest.name === user.name);
    const count = photosList.filter(p => p.uploaderNick === guest.nick).length;
    return h('div', {
      key: guest.id,
      style: {
        padding: 'var(--sp-2) 0',
        borderBottom: '0.5px solid var(--border-thin)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--sp-2)'
      }
    },
      h('div', null,
        h('span', {
          style: {
            fontFamily: 'var(--font-hand)',
            fontSize: '1.3rem',
            color: isMe ? 'var(--gold)' : 'var(--ink)'
          }
        }, guest.name),
        isMe && h('span', {
          style: {
            fontSize: 'var(--fs-xs)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginLeft: '8px'
          }
        }, '· siz'),
        guest.sharedBy && h('div', {
          style: {
            fontFamily: 'var(--font-body)',
            fontStyle: 'italic',
            fontSize: 'var(--fs-xs)',
            color: 'var(--ink-muted)'
          }
        }, `davet eden: ${guest.sharedBy}`)
      ),
      h('span', {
        style: {
          fontFamily: 'var(--font-body)',
          fontStyle: 'italic',
          fontSize: 'var(--fs-xs)',
          color: 'var(--ink-faint)',
          whiteSpace: 'nowrap'
        }
      }, count > 0 ? `${count} kare` : '')
    );
  };

  return h('div', {
    className: 'legal-modal-overlay open',
    onClick: (e) => {
      if (e.target === e.currentTarget) useAppStore.getState().closeHierarchy();
    }
  },
    h('div', { className: 'legal-modal', style: { maxWidth: '720px' } },
      h('div', { className: 'legal-modal-header' },
        h('div', null,
          h('div', { className: 'legal-modal-title' }, `${wedding?.name || 'Düğün'} · Düğün Hiyerarşisi`),
          h('div', { className: 't-xs t-muted' }, 'etkinlikteki konumunuz, yetkililer ve davet kolları')
        ),
        h('button', {
          type: 'button',
          className: 'legal-modal-close',
          onClick: () => useAppStore.getState().closeHierarchy()
        }, '×')
      ),
      h('div', { className: 'legal-modal-body' },
        // 1. BEN KİMİM? (Sizin Konumunuz — manager-line estetiğiyle)
        h('div', { className: 'manager-line', style: { marginTop: 0, marginBottom: 'var(--sp-6)' } },
          h('span', { className: 'manager-line-role' }, `bu düğündeki kimliğiniz · ${myRoleLabel}`),
          h('span', { className: 'manager-line-name' }, user?.name || 'Misafir'),
          h('span', { className: 'manager-line-note' }, myChannelNote)
        ),

        // 2. KATMAN I: Görev ve Sorumluluk Tablosu (RBAC — Kimin Hangi Yetkisi Var?)
        h('div', { className: 'hierarchy-section' },
          h('div', { className: 'manager-line-role', style: { marginBottom: 'var(--sp-3)' } },
            `I. görev ve sorumluluk tablosu (${membersList.length} kayıtlı kişi)`
          ),
          membersList.map(m => {
            const isMe = (user?.name && m.personName.toLowerCase() === user.name.toLowerCase()) || (user?.nick && m.nick === user.nick);
            const mPerms = [
              m.canManageSettings ? 'ayarlar & şifre' : null,
              m.canAssignRoles ? 'görev atama' : null,
              m.canModeratePhotos ? 'galeri moderasyon' : null,
              m.canShareLinks ? 'davet/qr paylaşımı' : null,
              m.canPrintExport ? 'baskı/indirme' : null,
              m.canUpload ? 'yükleme' : null
            ].filter(Boolean).join(' · ');

            return h('div', { key: m.id, className: 'guest-card' },
              h('div', { className: 'guest-card-left' },
                h('span', {
                  className: 'guest-card-name',
                  style: isMe ? { color: 'var(--gold)' } : null
                }, `${m.personName}${isMe ? ' (siz)' : ''}`),
                h('span', { className: 'guest-card-nick' },
                  `${m.roleTitle} · yetkiler: ${mPerms}`
                )
              ),
              canAssignRoles && !isMe && h('div', { className: 'resume-line-actions' },
                m.role === 'guest'
                  ? h('button', {
                      type: 'button',
                      className: 'resume-link resume-link--main',
                      onClick: () => useAppStore.getState().assignMemberRole({
                        personName: m.personName,
                        nick: m.nick,
                        phone: m.phone,
                        role: 'member_manager'
                      })
                    }, 'yetkili üye yap')
                  : (m.role === 'member_manager' || m.role === 'bestman') && h('button', {
                      type: 'button',
                      className: 'resume-link',
                      onClick: () => useAppStore.getState().assignMemberRole({
                        personName: m.personName,
                        nick: m.nick,
                        phone: m.phone,
                        role: 'guest'
                      })
                    }, 'davetliye çevir')
              )
            );
          })
        ),

        // 3. KATMAN II: Davetli Kolları (Gelin Tarafı · Damat Tarafı · Masa & Doğrudan Katılım)
        h('div', { className: 'hierarchy-section', style: { marginTop: 'var(--sp-6)' } },
          h('div', { className: 'manager-line-role', style: { marginBottom: 'var(--sp-3)' } },
            `II. davetli kolları & katılım ağacı (${attendeesList.length} kişi)`
          ),
          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 'var(--sp-6)'
            }
          },
            // Kol 1: Gelin Tarafı
            h('div', null,
              h('div', { className: 'manager-line-role', style: { color: 'var(--ink)' } }, `gelin tarafı (${gelinGuests.length})`),
              gelinGuests.length === 0
                ? h('div', { className: 'manager-line-note', style: { marginTop: 'var(--sp-2)' } }, 'henüz katılan yok')
                : gelinGuests.map(renderGuestLine)
            ),
            // Kol 2: Damat Tarafı
            h('div', null,
              h('div', { className: 'manager-line-role', style: { color: 'var(--ink)' } }, `damat tarafı (${damatGuests.length})`),
              damatGuests.length === 0
                ? h('div', { className: 'manager-line-note', style: { marginTop: 'var(--sp-2)' } }, 'henüz katılan yok')
                : damatGuests.map(renderGuestLine)
            ),
            // Kol 3: Masa QR & Diğer
            h('div', null,
              h('div', { className: 'manager-line-role', style: { color: 'var(--ink)' } }, `masa qr & doğrudan (${masaGuests.length})`),
              masaGuests.length === 0
                ? h('div', { className: 'manager-line-note', style: { marginTop: 'var(--sp-2)' } }, 'henüz katılan yok')
                : masaGuests.map(renderGuestLine)
            )
          )
        ),

        // 4. KATMAN III: Önceki Rollerim, Geçmiş Düğünler & Geçmiş İşler (Fotoğrafları ve Yönetimleri Gör)
        h('div', { className: 'hierarchy-section', style: { marginTop: 'var(--sp-6)' } },
          h('div', { className: 'manager-line-role', style: { marginBottom: 'var(--sp-3)' } },
            `III. önceki rollerim, geçmiş düğünler & işler (${WeddingRepository.getAll().length} düğün)`
          ),
          WeddingRepository.getAll().map(w => {
            const wPhotos = PhotoRepository.listByWedding(w.code);
            const wGuests = AttendanceRepository.listByWedding(w.code);
            const isCurrent = w.code === wedding?.code;
            const histMatch = (sessionHistory || []).find(item => item.weddingCode === w.code);
            const roleLabel =
              (histMatch?.role || w.ownerRole) === 'photographer' ? 'Fotoğrafçı · Organizasyon' :
              (histMatch?.role || w.ownerRole) === 'bestman' ? 'Sağdıç · Yardımcı Yönetici' :
              (histMatch?.role || w.ownerRole) === 'guest' ? 'Davetli' :
              'Düğün Sahibi · Yönetici';

            return h('div', { key: w.id, className: 'guest-card' },
              h('div', { className: 'guest-card-left' },
                h('span', {
                  className: 'guest-card-name',
                  style: isCurrent ? { color: 'var(--gold)' } : null
                }, w.name),
                h('span', { className: 'guest-card-nick' },
                  `${roleLabel} · ${w.date || w.createdAt}${w.venue ? ' · ' + w.venue : ''} · ${wPhotos.length} fotoğraf · ${wGuests.length} davetli`
                )
              ),
              h('div', { className: 'resume-line-actions' },
                isCurrent
                  ? h('span', { className: 'manager-line-note', style: { color: 'var(--gold)' } }, 'aktif düğün')
                  : h('button', {
                      type: 'button',
                      className: 'resume-link resume-link--main',
                      onClick: () => useAppStore.getState().switchToWeddingOrSession({
                        weddingCode: w.code,
                        role: histMatch?.role || w.ownerRole || 'owner',
                        name: histMatch?.name || w.ownerName
                      })
                    }, 'bu düğünün fotoğraflarına & yönetimine geç →')
              )
            );
          })
        )
      ),
      h('div', { className: 'legal-modal-footer' },
      h('div', {
        className: 'legal-modal-footer',
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
      },
        h('button', {
          type: 'button',
          className: 'resume-link',
          onClick: () => useAppStore.getState().logout()
        }, 'oturumu kapat / hesap değiştir'),
        h('button', {
          type: 'button',
          className: 'resume-link resume-link--main',
          onClick: () => useAppStore.getState().closeHierarchy()
        }, 'kapat')
      )
    )
  );
}
