import { h, useState } from '../react.js';
import { useStore, useAppStore } from '../store/index.js';
import { PhotoRepository } from '../services/repositories.js';

export function InviteeView() {
  const state = useStore(s => ({
    user: s.user,
    wedding: s.wedding,
    photos: s.photos,
    lastUploadedIds: s.lastUploadedIds,
    attendees: s.attendees,
    searchQuery: s.searchQuery,
    uploadProgress: s.uploadProgress
  }));
  const [galleryTab, setGalleryTab] = useState('all'); // 'all' | 'mine'

  const user = state.user;
  const wedding = state.wedding;
  const weddingCode = wedding?.code;
  const photos = state.photos || [];
  const myPhotos = photos.filter(p => p.uploaderNick === user?.nick);
  const lastUploadedIds = state.lastUploadedIds || [];

  const attendees = state.attendees || [];
  const myAttendee = attendees.find(a => a.nick === user?.nick || a.name === user?.name);
  const channelTitle =
    myAttendee?.ref === 'gelin' ? 'Gelin Tarafı Davetlisi' :
    myAttendee?.ref === 'damat' ? 'Damat Tarafı Davetlisi' :
    myAttendee?.ref === 'masa-qr' ? 'Masa Davetlisi' :
    'Düğün Davetlisi';
  const invitedByNote = myAttendee?.sharedBy || user?.sharedBy
    ? `davet eden: ${myAttendee?.sharedBy || user?.sharedBy}`
    : (myPhotos.length === 0 ? 'henüz fotoğraf yüklemediniz' : `${myPhotos.length} fotoğraf paylaştınız`);

  const baseList = galleryTab === 'mine' ? myPhotos : photos;
  const searchQuery = state.searchQuery || '';
  const displayedPhotos = searchQuery
    ? PhotoRepository.search(weddingCode, searchQuery, baseList)
    : baseList;

  return h('div', { className: 'screen active' },
    // [P0] Topbar: Çıkış, Düğün Başlığı, Düğün Hiyerarşisi, Bildirim ve Bağlantı
    // [P0] Topbar: Geri/İleri ok tuşları olmadan sade başlık ve eylemler (Tarayıcı geri tuşu doğal çalışır)
    h('div', { className: 'topbar' },
      h('button', { className: 'topbar-back', onClick: () => useAppStore.getState().logout() }, '← çıkış'),
      h('span', { className: 'topbar-title' }, wedding?.name || 'düğün'),
      h('div', { style: { display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' } },
        h('button', {
          type: 'button',
          className: 'topbar-action',
          onClick: () => useAppStore.getState().openHierarchy()
        }, 'düğün hiyerarşisi'),
        h('button', {
          type: 'button',
          className: 'topbar-action',
          onClick: () => useAppStore.getState().openGuestNotify()
        }, user?.phone ? 'bildirim aktif' : 'beni bul'),
        h('button', {
          type: 'button',
          className: 'topbar-action',
          onClick: () => useAppStore.getState().navigate('LINK_SHARE')
        }, 'bağlantı')
      )
    ),

    h('div', { className: 'page-wide', style: { paddingTop: 'var(--sp-4)' } },
      h('div', { className: 'stagger' },
        // [P0] Kimlik İmza Satırı (manager-line estetiğiyle) + Sağda Fotoğraf Ekle Butonu
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 'var(--sp-4)',
            paddingBottom: 'var(--sp-4)',
            borderBottom: '0.5px solid var(--border)'
          }
        },
          h('div', {
            className: 'manager-line',
            style: { marginTop: 'var(--sp-2)', cursor: 'pointer' },
            onClick: () => useAppStore.getState().openHierarchy(),
            title: 'Düğün hiyerarşisini ve konumunuzu görmek için dokunun'
          },
            h('span', { className: 'manager-line-role' }, channelTitle),
            h('span', { className: 'manager-line-name' }, user?.name || user?.nick || 'davetli'),
            h('span', { className: 'manager-line-note' },
              `${invitedByNote} · `,
              h('span', { style: { borderBottom: '0.5px solid var(--gold)', color: 'var(--ink)' } }, 'hiyerarşiyi gör')
            )
          ),
          h('label', { className: 'btn btn-primary btn-sm', style: { cursor: 'pointer', margin: 0 } },
            '+ fotoğraf ekle',
            h('input', {
              type: 'file',
              accept: 'image/*',
              multiple: true,
              style: { display: 'none' },
              onChange: e => {
                useAppStore.getState().uploadFiles(e.target.files);
                e.target.value = '';
              }
            })
          )
        ),

        state.uploadProgress !== null && h('div', { className: 'progress-bar mt-4' },
          h('div', { className: 'progress-bar-fill', style: { width: `${state.uploadProgress}%` } })
        ),

        // [2. AŞAMA] Fotoğraf Yüklendikten Sonra Zarif Tek Cümlelik Satır (resume-line estetiği)
        lastUploadedIds.length > 0 && h('div', { className: 'resume-line mt-4' },
          h('p', { className: 'resume-line-text' },
            `${lastUploadedIds.length} fotoğrafınız albüme eklendi`
          ),
          h('div', { className: 'resume-line-actions' },
            h('button', {
              type: 'button',
              className: 'resume-link resume-link--main',
              onClick: () => useAppStore.getState().openLightbox(lastUploadedIds[0])
            }, 'fotoğrafı aç ve içine yazı bırak'),
            h('span', { className: 'resume-sep' }, '·'),
            h('label', { className: 'resume-link', style: { cursor: 'pointer' } },
              'toplu fotoğraf ekle',
              h('input', {
                type: 'file',
                accept: 'image/*',
                multiple: true,
                style: { display: 'none' },
                onChange: e => {
                  useAppStore.getState().uploadFiles(e.target.files);
                  e.target.value = '';
                }
              })
            ),
            h('span', { className: 'resume-sep' }, '·'),
            h('button', {
              type: 'button',
              className: 'resume-link',
              onClick: () => useAppStore.getState().clearLastUploadedPrompt()
            }, 'gizle')
          )
        ),

        // [P1] Galeri Filtre Sekmeleri: Tüm Galeri vs Benim Yüklediklerim + Arama
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--sp-2)',
            marginTop: 'var(--sp-4)',
            marginBottom: 'var(--sp-4)'
          }
        },
          h('div', { className: 'tracking-filter-group', style: { margin: 0 } },
            h('button', {
              type: 'button',
              className: `tracking-filter-btn ${galleryTab === 'all' ? 'active' : ''}`,
              onClick: () => setGalleryTab('all')
            }, `Tüm Galeri (${photos.length})`),
            h('button', {
              type: 'button',
              className: `tracking-filter-btn ${galleryTab === 'mine' ? 'active' : ''}`,
              onClick: () => setGalleryTab('mine')
            }, `Benim Yüklediklerim (${myPhotos.length})`)
          ),
          h('input', {
            className: 'input-field',
            type: 'search',
            placeholder: 'isim, @nick veya yazı ara...',
            value: searchQuery,
            onChange: e => useAppStore.getState().setSearchQuery(e.target.value),
            style: { maxWidth: '260px', padding: '5px 12px', fontSize: 'var(--fs-xs)' }
          })
        ),

        // [P0] Tam Ekran Geniş Galeri (Sağ-Sol Tamamını Kaplar)
        displayedPhotos.length === 0
          ? h('div', { className: 't-sub t-center t-italic', style: { padding: 'var(--sp-12) 0' } },
              galleryTab === 'mine' ? 'henüz yüklediğiniz bir fotoğraf bulunmuyor' : 'henüz fotoğraf yok, ilk siz yükleyin'
            )
          : h('div', { className: 'photo-grid cols-3' },
              displayedPhotos.map(p => h('div', {
                key: p.id,
                className: 'photo-item',
                onClick: () => useAppStore.getState().openLightbox(p.id)
              },
                h('img', { src: p.dataUrl, alt: p.fileName, loading: 'lazy' }),
                h('div', {
                  style: {
                    position: 'absolute',
                    bottom: '6px',
                    left: '8px',
                    right: '8px',
                    fontSize: '11px',
                    color: '#fff',
                    textShadow: '0 1px 4px rgba(0,0,0,0.9)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: '8px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden'
                  }
                },
                  h('span', null, `@${p.uploaderNick}`),
                  p.caption && h('span', {
                    style: {
                      fontFamily: 'var(--font-hand)',
                      fontSize: '14px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }
                  }, p.caption)
                )
              ))
            )
      )
    )
  );
}
