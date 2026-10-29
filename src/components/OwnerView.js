import { h, useState } from '../react.js';
import { useStore, useAppStore } from '../store/index.js';
import { WeddingRepository, PhotoRepository, AttendanceRepository, MemberRepository } from '../services/repositories.js';
import { SecurityVault } from '../services/security.js';

export function OwnerView() {
  const state = useStore(s => ({
    wedding: s.wedding,
    user: s.user,
    photos: s.photos,
    selectedPhotos: s.selectedPhotos,
    isSelectionMode: s.isSelectionMode,
    searchQuery: s.searchQuery,
    guestFilter: s.guestFilter,
    lastUploadedIds: s.lastUploadedIds,
    attendees: s.attendees,
    members: s.members,
    attendeeFilter: s.attendeeFilter,
    sessionHistory: s.sessionHistory
  }));
  const [activeTab, setActiveTab] = useState('photos'); // 'photos' | 'guests' | 'portfolio'

  const weddingCode = state.wedding?.code;
  const activePhotos = PhotoRepository.listByWedding(weddingCode);
  const archivedPhotos = PhotoRepository.listArchivedByWedding(weddingCode);

  const searchQuery = state.searchQuery || '';
  const filteredBySearch = searchQuery
    ? PhotoRepository.search(weddingCode, searchQuery, activePhotos)
    : activePhotos;

  const currentPhotos = state.guestFilter
    ? filteredBySearch.filter(p => p.uploaderNick === state.guestFilter)
    : filteredBySearch;

  const selectedCount = state.selectedPhotos.length;
  const isAllSelected = currentPhotos.length > 0 && selectedCount === currentPhotos.length;
  const attendees = state.attendees || [];

  const filteredAttendees = attendees.filter(a => {
    if (state.attendeeFilter === 'all') return true;
    return a.ref === state.attendeeFilter;
  });

  const stats = {
    total: attendees.length,
    gelin: attendees.filter(a => a.ref === 'gelin').length,
    damat: attendees.filter(a => a.ref === 'damat').length,
    qr: attendees.filter(a => a.ref === 'masa-qr' || a.ref === 'qr').length
  };

  const userRole = state.user?.role || state.wedding?.ownerRole || 'groom_owner';
  const roleTitle = state.user?.roleTitle || SecurityVault.getRoleTitle(userRole);
  const managerDisplayName = state.user?.name || state.wedding?.ownerName || 'Mehmet Yılmaz';
  const weddingMembers = MemberRepository.listByWedding(weddingCode);
  const canAssignRoles = Boolean(state.user?.permissions?.canAssignRoles || userRole === 'bride_owner' || userRole === 'groom_owner' || userRole === 'owner');
  const canManageSettings = Boolean(state.user?.permissions?.canManageSettings || userRole === 'bride_owner' || userRole === 'groom_owner' || userRole === 'owner' || userRole === 'photographer');

  const onPhotoClick = (photoId) => {
    if (state.isSelectionMode || state.selectedPhotos.length > 0) {
      useAppStore.getState().toggleSelectPhoto(photoId);
    } else {
      useAppStore.getState().openLightbox(photoId);
    }
  };

  return h('div', { className: 'screen active' },
    // [P0] Topbar: Çıkış, Düğün Başlığı, Düğün Hiyerarşisi, Bağlantılar ve Ayarlar
    // [P0] Topbar: Geri/İleri ok tuşları olmadan sade başlık ve eylemler (Tarayıcı geri tuşu doğal çalışır)
    h('div', { className: 'topbar' },
      h('button', { className: 'topbar-back', onClick: () => useAppStore.getState().logout() }, '← çıkış'),
      h('span', { className: 'topbar-title' }, state.wedding?.name || 'düğün'),
      h('div', { style: { display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' } },
        h('button', {
          type: 'button',
          className: 'topbar-action',
          onClick: () => useAppStore.getState().openHierarchy()
        }, 'düğün hiyerarşisi'),
        h('button', {
          type: 'button',
          className: 'topbar-action',
          onClick: () => useAppStore.getState().navigate('LINK_SHARE')
        }, 'bağlantılar'),
        h('button', {
          type: 'button',
          className: 'topbar-action',
          onClick: () => useAppStore.getState().openOwnerSettings()
        }, `ayarlar${archivedPhotos.length > 0 ? ` (${archivedPhotos.length})` : ''}`)
      )
    ),

    h('div', { className: 'page-wide', style: { paddingTop: 'var(--sp-4)' } },
      h('div', { className: 'stagger' },
        // [P0] Kimlik İmza Satırı (manager-line) + Sağda Fotoğraf Ekle Butonu
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
            id: 'manager-badge-card',
            style: { marginTop: 'var(--sp-2)', cursor: 'pointer' },
            onClick: () => useAppStore.getState().openHierarchy(),
            title: 'Düğün hiyerarşisini ve konumunuzu görmek için dokunun'
          },
            h('span', { className: 'manager-line-role', id: 'owner-manager-role' }, roleTitle),
            h('span', { className: 'manager-line-name', id: 'owner-manager-name' }, managerDisplayName),
            h('span', { className: 'manager-line-note' },
              `${activePhotos.length} fotoğraf · ${attendees.length} davetli · `,
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

        // [2. AŞAMA] Fotoğraf Yüklendikten Sonra Zarif Tek Cümlelik Satır (resume-line estetiği)
        (state.lastUploadedIds && state.lastUploadedIds.length > 0) && h('div', { className: 'resume-line mt-4' },
          h('p', { className: 'resume-line-text' },
            `${state.lastUploadedIds.length} fotoğraf albüme eklendi`
          ),
          h('div', { className: 'resume-line-actions' },
            h('button', {
              type: 'button',
              className: 'resume-link resume-link--main',
              onClick: () => useAppStore.getState().openLightbox(state.lastUploadedIds[0])
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

        // [P0] Ana Sekmeler: Fotoğraflar · Davetliler · Geçmiş İşler & Düğünler
        h('div', { className: 'landing-tabs mt-4', style: { marginBottom: 'var(--sp-4)', maxWidth: '640px' } },
          h('button', {
            type: 'button',
            className: `landing-tab-btn ${activeTab === 'photos' ? 'active' : ''}`,
            onClick: () => setActiveTab('photos')
          }, `Fotoğraflar (${activePhotos.length})`),
          h('button', {
            type: 'button',
            className: `landing-tab-btn ${activeTab === 'guests' ? 'active' : ''}`,
            onClick: () => setActiveTab('guests')
          }, `Davetliler (${attendees.length})`),
          h('button', {
            type: 'button',
            className: `landing-tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`,
            onClick: () => setActiveTab('portfolio')
          }, `Geçmiş İşler & Düğünler (${WeddingRepository.getAll().length})`)
        ),

        // TAB A: Fotoğraflar (Tam Ekran Geniş Galeri)
        activeTab === 'photos' && h('div', null,
          state.guestFilter && h('div', { className: 'resume-line' },
            h('p', { className: 'resume-line-text' },
              'filtre: ',
              h('span', { className: 'resume-line-name' }, state.guestFilter)
            ),
            h('div', { className: 'resume-line-actions' },
              h('button', {
                type: 'button',
                className: 'resume-link resume-link--main',
                onClick: () => useAppStore.getState().setGuestFilter(null)
              }, 'tüm fotoğrafları göster')
            )
          ),

          // Galeri Üst Aksiyon Satırı: Sade Arama + Seçim Modu
          h('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--sp-3)',
              marginBottom: 'var(--sp-4)'
            }
          },
            h('div', { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flex: '1 1 260px', maxWidth: '420px' } },
              h('input', {
                className: 'input-field',
                type: 'search',
                placeholder: 'kişi adı, @nick veya fotoğraf yazısı ara...',
                value: searchQuery,
                onChange: e => useAppStore.getState().setSearchQuery(e.target.value),
                style: { flex: 1, padding: '6px 12px' }
              }),
              searchQuery && h('button', {
                type: 'button',
                className: 'resume-link',
                onClick: () => useAppStore.getState().setSearchQuery('')
              }, 'temizle')
            ),
            h('div', { className: 'resume-line-actions' },
              h('button', {
                type: 'button',
                className: `resume-link ${state.isSelectionMode ? 'resume-link--main' : ''}`,
                onClick: () => useAppStore.getState().toggleSelectionMode()
              }, state.isSelectionMode ? 'seçimi bitir' : 'fotoğraf seç'),
              state.isSelectionMode && h('span', { className: 'resume-sep' }, '·'),
              state.isSelectionMode && h('button', {
                type: 'button',
                className: 'resume-link',
                onClick: () => isAllSelected ? useAppStore.getState().clearSelection() : useAppStore.getState().selectAllPhotos()
              }, isAllSelected ? 'seçimi kaldır' : 'tümünü seç')
            )
          ),

          currentPhotos.length === 0
            ? h('div', { className: 't-sub t-center t-italic', style: { padding: 'var(--sp-12) 0' } },
                searchQuery ? `"${searchQuery}" aramasına uygun fotoğraf bulunamadı` : 'henüz fotoğraf yüklenmedi'
              )
            : h('div', { className: 'photo-grid cols-3' },
                currentPhotos.map(p => {
                  const isSelected = state.selectedPhotos.includes(p.id);
                  return h('div', {
                    key: p.id,
                    className: `photo-item ${isSelected ? 'selected' : ''}`,
                    onClick: () => onPhotoClick(p.id)
                  },
                    h('img', { src: p.dataUrl, alt: p.fileName, loading: 'lazy' }),
                    (state.isSelectionMode || isSelected) && h('div', { className: 'check' }),
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
                  );
                })
              )
        ),

        // TAB B: Davetliler & Katılım Kaynağı (Kutu/Avatar/Hap olmadan sade editoryal satırlar)
        activeTab === 'guests' && h('div', { style: { maxWidth: '820px' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--sp-4)', flexWrap: 'wrap', gap: 'var(--sp-3)' } },
            h('div', { className: 'resume-line-actions', style: { justifyContent: 'flex-start' } },
              h('button', {
                type: 'button',
                className: `resume-link ${state.attendeeFilter === 'all' ? 'resume-link--main' : ''}`,
                onClick: () => useAppStore.getState().setAttendeeFilter('all')
              }, `tümü (${stats.total})`),
              h('span', { className: 'resume-sep' }, '·'),
              h('button', {
                type: 'button',
                className: `resume-link ${state.attendeeFilter === 'gelin' ? 'resume-link--main' : ''}`,
                onClick: () => useAppStore.getState().setAttendeeFilter('gelin')
              }, `gelin tarafı (${stats.gelin})`),
              h('span', { className: 'resume-sep' }, '·'),
              h('button', {
                type: 'button',
                className: `resume-link ${state.attendeeFilter === 'damat' ? 'resume-link--main' : ''}`,
                onClick: () => useAppStore.getState().setAttendeeFilter('damat')
              }, `damat tarafı (${stats.damat})`),
              h('span', { className: 'resume-sep' }, '·'),
              h('button', {
                type: 'button',
                className: `resume-link ${state.attendeeFilter === 'masa-qr' ? 'resume-link--main' : ''}`,
                onClick: () => useAppStore.getState().setAttendeeFilter('masa-qr')
              }, `masa qr (${stats.qr})`)
            ),
            h('button', {
              type: 'button',
              className: 'resume-link',
              onClick: () => useAppStore.getState().openHierarchy()
            }, 'tüm düğün hiyerarşisini gör')
          ),

          filteredAttendees.length === 0
            ? h('div', { className: 't-sub t-center t-italic', style: { padding: 'var(--sp-8) 0' } }, 'bu kolda henüz katılan bulunmuyor')
            : h('div', null,
                filteredAttendees.map(a => {
                  const guestPhotos = activePhotos.filter(p => p.uploaderNick === a.nick);
                  const memberEntry = weddingMembers.find(m =>
                    (m.nick && m.nick === a.nick) ||
                    (m.personName && m.personName.toLowerCase() === a.name.toLowerCase())
                  );
                  const currentMemberRole = memberEntry?.role || 'guest';
                  const currentRoleTitle = memberEntry?.roleTitle || 'Davetli Üye';
                  const isElevated = currentMemberRole !== 'guest';

                  return h('div', { key: a.id, className: 'guest-card' },
                    h('div', { className: 'guest-card-left' },
                      h('span', { className: 'guest-card-name' }, a.name),
                      h('span', {
                        className: 'guest-card-nick',
                        style: isElevated ? { color: 'var(--gold)' } : null
                      },
                        `${currentRoleTitle} · ${a.refLabel || 'davetli'}${a.sharedBy ? ` · davet eden: ${a.sharedBy}` : ''} · ${a.joinedAt}`
                      )
                    ),
                    h('div', { className: 'resume-line-actions', style: { flexWrap: 'wrap', justifyContent: 'flex-end' } },
                      h('span', { className: 'manager-line-note' },
                        guestPhotos.length > 0 ? `${guestPhotos.length} fotoğraf` : 'henüz fotoğraf yok'
                      ),
                      guestPhotos.length > 0 && h('button', {
                        type: 'button',
                        className: 'resume-link resume-link--main',
                        onClick: () => {
                          useAppStore.getState().setGuestFilter(a.nick);
                          setActiveTab('photos');
                        }
                      }, 'kareleri gör'),
                      canAssignRoles && h('span', { className: 'resume-sep' }, '·'),
                      canAssignRoles && (
                        isElevated
                          ? h('button', {
                              type: 'button',
                              className: 'resume-link',
                              onClick: () => useAppStore.getState().assignMemberRole({
                                personName: a.name,
                                nick: a.nick,
                                phone: a.phone,
                                role: 'guest'
                              })
                            }, 'yetkiyi geri al')
                          : h('button', {
                              type: 'button',
                              className: 'resume-link',
                              style: { color: 'var(--gold)' },
                              onClick: () => useAppStore.getState().assignMemberRole({
                                personName: a.name,
                                nick: a.nick,
                                phone: a.phone,
                                role: 'member_manager'
                              })
                            }, 'yetkili üye yap')
                      )
                    )
                  );
                })
              )
        ),

        // TAB C: Önceki Rollerim, Geçmiş İşler & Düğünler (Geçmiş Düğünlerin Fotoğrafları ve Yönetimleri)
        activeTab === 'portfolio' && h('div', null,
          WeddingRepository.getAll().map(w => {
            const wPhotos = PhotoRepository.listByWedding(w.code);
            const wGuests = AttendanceRepository.listByWedding(w.code);
            const isCurrent = w.code === weddingCode;
            const histMatch = (state.sessionHistory || []).find(item => item.weddingCode === w.code);
            const roleLabel =
              (histMatch?.role || w.ownerRole) === 'photographer' ? 'Fotoğrafçı · Organizasyon' :
              (histMatch?.role || w.ownerRole) === 'bestman' ? 'Sağdıç · Yardımcı Yönetici' :
              (histMatch?.role || w.ownerRole) === 'guest' ? 'Davetli' :
              'Düğün Sahibi · Yönetici';

            return h('div', { key: w.id, className: 'hierarchy-section', style: { marginBottom: 'var(--sp-8)' } },
              h('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: 'var(--sp-3)',
                  marginBottom: 'var(--sp-4)'
                }
              },
                h('div', null,
                  h('div', { className: 'manager-line-role' },
                    `${roleLabel} · ${w.date || w.createdAt}${w.venue ? ' · ' + w.venue : ''}`
                  ),
                  h('div', {
                    className: 'manager-line-name',
                    style: isCurrent ? { color: 'var(--gold)' } : null
                  }, w.name),
                  h('div', { className: 'manager-line-note' },
                    `${wPhotos.length} fotoğraf · ${wGuests.length} davetli · düğün kodu: ${w.code}`
                  )
                ),
                h('div', { className: 'resume-line-actions' },
                  isCurrent
                    ? h('span', { className: 'manager-line-note', style: { color: 'var(--gold)' } }, 'şu an bu düğünü yönetiyorsunuz')
                    : h('button', {
                        type: 'button',
                        className: 'resume-link resume-link--main',
                        onClick: () => {
                          useAppStore.getState().switchToWeddingOrSession({
                            weddingCode: w.code,
                            role: histMatch?.role || w.ownerRole || 'owner',
                            name: histMatch?.name || w.ownerName
                          });
                          setActiveTab('photos');
                        }
                      }, 'bu düğünün yönetimine & fotoğraflarına geç →')
                )
              ),
              wPhotos.length > 0 && h('div', { className: 'photo-grid cols-3' },
                wPhotos.slice(0, 6).map(p => h('div', {
                  key: p.id,
                  className: 'photo-item',
                  onClick: () => {
                    if (!isCurrent) {
                      useAppStore.getState().switchToWeddingOrSession({
                        weddingCode: w.code,
                        role: histMatch?.role || w.ownerRole || 'owner',
                        name: histMatch?.name || w.ownerName
                      });
                    }
                    useAppStore.getState().openLightbox(p.id);
                  }
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
            );
          })
        )
      )
    ),

    // [P1] Yüzen Seçim Aksiyon Çubuğu (İndir, Yazdır, Gizle)
    selectedCount > 0 && h('div', { className: 'selection-bar visible', style: { display: 'flex' } },
      h('span', { className: 't-sm' }, `${selectedCount} seçildi`),
      h('div', { className: 'resume-line-actions' },
        h('button', {
          type: 'button',
          className: 'resume-link resume-link--main',
          onClick: () => useAppStore.getState().downloadSelectedPhotos()
        }, 'indir'),
        h('span', { className: 'resume-sep' }, '·'),
        h('button', {
          type: 'button',
          className: 'resume-link',
          onClick: () => useAppStore.getState().printPhotos()
        }, 'yazdır'),
        h('span', { className: 'resume-sep' }, '·'),
        h('button', {
          type: 'button',
          className: 'resume-link',
          style: { color: '#c0392b' },
          onClick: () => useAppStore.getState().softDeleteSelectedPhotos()
        }, 'galeriden gizle')
      )
    )
  );
}
