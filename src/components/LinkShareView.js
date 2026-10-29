import { h, useState, useRef } from '../react.js';
import { useStore, useAppStore } from '../store/index.js';
import { LinkEngine } from '../services/linkEngine.js';

export function LinkShareView() {
  const { wedding, user, shareLinks } = useStore(s => ({
    wedding: s.wedding,
    user: s.user,
    shareLinks: s.shareLinks
  }));
  const weddingCode = wedding?.code || 'ayse-mehmet';
  const defaultGiver = user?.name || wedding?.ownerName || 'Emre & Ayşe';

  // Refs instead of useState for text inputs -> zero re-renders on keystroke
  const giverInputRef = useRef(null);
  const recipientInputRef = useRef(null);
  const channelSelectRef = useRef(null);

  const [activeQr, setActiveQr] = useState(null); // { url, label, recipient, giver, tokenId }
  const [showCustomForm, setShowCustomForm] = useState(false); // P2 Collapsible
  const [showLedger, setShowLedger] = useState(false);         // P2 Collapsible

  const linksList = shareLinks || [];

  const channels = [
    {
      id: 'gelin',
      title: 'gelin davet bağlantısı',
      sub: `gelin tarafı davetlileri için · şifre: ${wedding?.guestPasscode || '1234'}`
    },
    {
      id: 'damat',
      title: 'damat davet bağlantısı',
      sub: `damat tarafı davetlileri için · şifre: ${wedding?.guestPasscode || '1234'}`
    },
    {
      id: 'masa-qr',
      title: 'masa qr & davet kartı bağlantısı',
      sub: `masalardaki qr kartlar için · şifre: ${wedding?.guestPasscode || '1234'}`
    },
    {
      id: 'owner',
      title: 'düğün sahibi & sağdıç yönetim bağlantısı',
      sub: `yönetici şifresi: ${wedding?.ownerPasscode || '1234'}`,
      highlight: true
    }
  ];

  // Record the share in DB ("who gave, to whom, when") and copy the tracked URL
  const handleShareAndCopy = (channel, shareType = 'link') => {
    const sharedByName = giverInputRef.current ? giverInputRef.current.value : defaultGiver;
    const sharedToName = recipientInputRef.current ? recipientInputRef.current.value : '';

    const res = useAppStore.getState().createShareRecord({
      channel,
      shareType,
      sharedByName,
      sharedToName
    });
    if (!res) return;

    if (shareType === 'qr') {
      setActiveQr({
        url: res.trackedUrl,
        label: `${wedding?.name || weddingCode} · ${res.record.sharedToName}`,
        giver: res.record.sharedByName,
        recipient: res.record.sharedToName,
        tokenId: res.record.id
      });
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(res.trackedUrl).then(() => {
        useAppStore.getState().toast(`Kaydedildi ve kopyalandı: ${res.record.sharedByName} → ${res.record.sharedToName}`);
      });
    } else {
      useAppStore.getState().toast(`Paylaşım kaydedildi: ${res.record.sharedByName} → ${res.record.sharedToName}`);
    }
  };

  const isManager = user?.role === 'owner' || user?.role === 'bestman' || user?.role === 'photographer';
  const backScreen = isManager ? 'OWNER_PANEL' : (user?.role === 'guest' ? 'INVITEE_PANEL' : 'ROLE_SELECT');

  return h('div', { className: 'screen active' },
    h('div', { className: 'topbar' },
      h('button', { className: 'topbar-back', onClick: () => useAppStore.getState().navigate(backScreen) }, '← geri'),
      h('span', { className: 'topbar-title' }, `${wedding?.name || 'düğün'} · bağlantılar & qr`),
      isManager
        ? h('button', { className: 'topbar-action', onClick: () => useAppStore.getState().navigate('OWNER_PANEL') }, 'yönetim paneli →')
        : h('span', null)
      h('div', { style: { display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' } },
        h('button', {
          type: 'button',
          className: 'topbar-action',
          onClick: () => useAppStore.getState().navigate(backScreen)
        }, 'galeriye dön')
      )
    ),
    h('div', { className: 'page', style: { paddingTop: 'var(--sp-6)' } },
      h('div', { className: 'stagger' },

        // [P1] Aktif QR Kodu Önizleme Kutusu (Eğer QR Göster'e Tıklandıysa En Üstte Açılır)
        activeQr && h('div', { className: 'security-passcode-card', style: { textAlign: 'center', borderColor: 'var(--gold)', marginTop: 0, marginBottom: 'var(--sp-4)' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' } },
            h('span', { className: 't-xs t-muted t-uppercase' }, `takipli qr kod · kod: ${activeQr.tokenId}`),
            h('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: () => setActiveQr(null) }, 'kapat')
          ),
          h('div', { className: 'qr-box', style: { width: '190px', height: '210px', margin: '0 auto', background: '#fff' } },
            h('img', { src: LinkEngine.generateQrSvg(activeQr.url, activeQr.recipient), alt: 'QR Code', style: { width: '100%', height: '100%', objectFit: 'contain' } })
          ),
          h('div', { className: 't-xs t-muted mt-2' }, `Veren: ${activeQr.giver} → Alan: ${activeQr.recipient}`),
          h('div', { className: 'share-link-url-box mt-2' },
            h('span', { className: 'share-link-url' }, activeQr.url),
            h('button', {
              type: 'button',
              className: 'share-link-copy-btn',
              onClick: () => {
                if (navigator.clipboard) navigator.clipboard.writeText(activeQr.url);
                useAppStore.getState().toast('QR bağlantısı kopyalandı.');
              }
            }, 'kopyala')
          )
        ),

        // [P0] 4 Ana Kanal Kartı: Tek Tıkla Link Kopyala veya QR Göster
        channels.map(ch => {
          const previewUrl = LinkEngine.buildTrackedUrl({
            weddingCode,
            channel: ch.id,
            shareType: ch.id === 'masa-qr' ? 'qr' : 'link',
            sharedBy: defaultGiver,
            sharedTo: ''
          });
          return h('div', {
            key: ch.id,
            className: 'share-link-item',
            style: ch.highlight ? { borderLeft: '2.5px solid var(--gold)' } : null
          },
            h('div', { className: 'share-link-header' },
              h('span', { className: 'share-link-title' }, ch.title),
              h('div', { style: { display: 'flex', gap: 'var(--sp-2)' } },
                h('button', {
                  type: 'button',
                  className: 'share-link-copy-btn',
                  onClick: () => handleShareAndCopy(ch.id, 'qr')
                }, 'qr göster'),
                h('button', {
                  type: 'button',
                  className: 'share-link-copy-btn',
                  onClick: () => handleShareAndCopy(ch.id, 'link')
                }, 'link kopyala')
              )
            ),
            h('div', { className: 'share-link-url-box' },
              h('span', { className: 'share-link-url' }, previewUrl)
            ),
            h('div', { className: 't-xs t-muted mt-1' }, ch.sub)
          );
        }),

        // [P2] İkincil Aksiyon Düğmeleri: Özel "Kimden → Kime" Üretici ve Paylaşım Kayıt Defteri
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--sp-2)',
            marginTop: 'var(--sp-4)',
            paddingTop: 'var(--sp-3)',
            borderTop: '0.5px solid var(--border)'
          }
        },
          h('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            onClick: () => setShowCustomForm(v => !v)
          }, showCustomForm ? '− özel alıcı formunu kapat' : '+ kişiye / masaya özel link üret'),
          h('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            onClick: () => setShowLedger(v => !v)
          }, showLedger ? '− paylaşım kayıtlarını gizle' : `paylaşım kayıt defteri (${linksList.length})`)
        ),

        // [P2] Açılır Kutu 1: Kişiye veya Masaya Özel ("Kimden → Kime") Takipli Link/QR Oluşturucu
        showCustomForm && h('div', { className: 'security-passcode-card mt-4' },
          h('div', { className: 't-xs t-muted t-uppercase', style: { letterSpacing: '0.08em', marginBottom: 'var(--sp-3)' } }, 'kişiye veya masaya özel takipli bağlantı / qr üret'),
          h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' } },
            h('div', { className: 'input-group' },
              h('label', { className: 'input-label' }, 'bağlantıyı veren (kimden)'),
              h('input', {
                ref: giverInputRef,
                className: 'input-field',
                type: 'text',
                placeholder: 'ör. Emre (Damat)',
                defaultValue: defaultGiver
              })
            ),
            h('div', { className: 'input-group' },
              h('label', { className: 'input-label' }, 'verilen kişi / masa (kime)'),
              h('input', {
                ref: recipientInputRef,
                className: 'input-field',
                type: 'text',
                placeholder: 'ör. Ahmet Yılmaz veya Masa 5',
                defaultValue: ''
              })
            )
          ),
          h('div', { style: { display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-3)', alignItems: 'center' } },
            h('select', {
              ref: channelSelectRef,
              className: 'input-field',
              style: { flex: 1 },
              defaultValue: 'gelin'
            },
              h('option', { value: 'gelin' }, 'Gelin Tarafı Davetiyesi'),
              h('option', { value: 'damat' }, 'Damat Tarafı Davetiyesi'),
              h('option', { value: 'masa-qr' }, 'Masa QR Kartı'),
              h('option', { value: 'owner' }, 'Yönetici / Sağdıç Yetkisi')
            ),
            h('button', {
              type: 'button',
              className: 'btn btn-primary btn-sm',
              onClick: () => handleShareAndCopy(channelSelectRef.current?.value || 'gelin', 'link')
            }, 'Link Üret & Kopyala'),
            h('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              onClick: () => handleShareAndCopy(channelSelectRef.current?.value || 'gelin', 'qr')
            }, 'QR Üret')
          )
        ),

        // [P2] Açılır Kutu 2: Paylaşım Kayıt Defteri (Kim Kime Ne Zaman Verdi & İptal Etme)
        showLedger && h('div', { className: 'hierarchy-section mt-6' },
          h('div', { className: 'manager-line-role mb-4' },
            `bağlantı & qr paylaşım kayıtları (${linksList.length})`
          ),
          linksList.length === 0
            ? h('div', { className: 't-sub t-center t-italic' }, 'henüz paylaşılan bağlantı kaydı yok')
            : h('div', null,
                linksList.map(sl => h('div', {
                  key: sl.id,
                  className: 'guest-card',
                  style: sl.isRevoked ? { opacity: 0.45 } : null
                },
                  h('div', { className: 'guest-card-left' },
                    h('span', { className: 'guest-card-name' }, `${sl.sharedByName} → ${sl.sharedToName}`),
                    h('span', { className: 'guest-card-nick' },
                      `${sl.channel} · ${sl.shareType} · verildi: ${sl.sharedAt} · açılma: ${sl.openCount || 0} · katılan: ${sl.joinCount || 0}`,
                      sl.lastOpenedBy ? ` (son: ${sl.lastOpenedBy} · ${sl.lastOpenedAt})` : ''
                    )
                  ),
                  !sl.isRevoked ? h('button', {
                    type: 'button',
                    className: 'resume-link',
                    style: { color: '#c0392b' },
                    onClick: () => useAppStore.getState().revokeShareRecord(sl.id)
                  }, 'iptal et') : h('span', { className: 'manager-line-note' }, 'iptal edildi')
                ))
              )
        )
      )
    )
  );
}
