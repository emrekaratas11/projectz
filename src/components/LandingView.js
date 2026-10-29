import { h } from '../react.js';
import { useStore, useAppStore } from '../store/index.js';

export function LandingView() {
  // Granular selector: only re-renders when navigation tab, mode, or session banner changes
  // ZERO useState for text inputs -> typing a character triggers 0 re-renders and 0 flicker!
  const {
    landingTab,
    manageMode,
    user: savedSession,
    sessionHistory,
    isSwitchingAccount,
    wedding,
    incomingRef,
    incomingSharedBy,
    invalidLinkCode
  } = useStore(s => ({
    landingTab: s.landingTab,
    manageMode: s.manageMode,
    user: s.user,
    sessionHistory: s.sessionHistory,
    isSwitchingAccount: s.isSwitchingAccount,
    wedding: s.wedding,
    incomingRef: s.incomingRef,
    incomingSharedBy: s.incomingSharedBy,
    invalidLinkCode: s.invalidLinkCode
  }));

  const onGuestSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const hasConsent = fd.get('guestConsent') === 'on';
    useAppStore.getState().joinAsGuest({
      name: String(fd.get('guestName') || ''),
      pin: String(fd.get('guestPin') || ''),
      phone: '',
      code: String(fd.get('guestCode') || wedding?.code || ''),
      consentKvkk: hasConsent,
      consentLiab: hasConsent
    });
  };

  const onManageSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    useAppStore.getState().loginAsManager({
      code: String(fd.get('mCode') || wedding?.code || ''),
      name: String(fd.get('mName') || ''),
      role: String(fd.get('mRole') || 'owner'),
      passcode: String(fd.get('mPass') || ''),
      consentKvkk: true,
      consentLiab: true
    });
  };

  const onCreateSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const hasConsent = fd.get('cConsent') === 'on';
    useAppStore.getState().createNewWedding({
      name: String(fd.get('cName') || ''),
      date: String(fd.get('cDate') || ''),
      managerName: String(fd.get('cManagerName') || ''),
      managerRole: String(fd.get('cManagerRole') || 'owner'),
      ownerPin: String(fd.get('cOwnerPin') || ''),
      guestPin: String(fd.get('cGuestPin') || ''),
      consentKvkk: hasConsent,
      consentLiab: hasConsent
    });
  };

  const historyList = sessionHistory || [];
  const todayIso = new Date().toISOString().split('T')[0];

  const formatRoleLabel = (role) =>
    role === 'bride_owner' ? 'düğün sahibi · gelin' :
    role === 'groom_owner' ? 'düğün sahibi · damat' :
    role === 'owner' ? 'düğün sahibi' :
    role === 'photographer' ? 'fotoğrafçı' :
    role === 'bestman' ? 'sağdıç' : 'davetli';
    role === 'bestman' ? 'sağdıç / nedime' :
    role === 'member_manager' ? 'yetkili üye · moderatör' : 'davetli';

  return h('div', { className: 'landing-split active' },
    // Sol Görsel Alanı (Masaüstü)
    h('div', { className: 'landing-visual' },
      h('div', { className: 'landing-visual-content' },
        h('div', { className: 'landing-visual-brand' },
          h('div', { className: 'logo-mark' }, 'fotoyonetim'),
          h('div', { className: 'logo-sub' }, 'dijital anı arşivi')
        ),
        h('div', { className: 'landing-visual-bottom' },
          h('div', { className: 'landing-visual-quote' }, wedding?.name || 'Ayşe & Mehmet'),
          h('div', { className: 'landing-visual-desc' }, wedding?.welcomeNote || 'çekilen her kare, paylaşılan her tebessüm saklanır.')
        )
      )
    ),
    // Sağ Panel
    h('div', { className: 'landing-panel' },
      h('div', { className: 'landing-card' },
        // Not: "fotoyonetim · özel etkinlik fotoğraf platformu" başlığı kaldırıldı; ekran doğrudan eyleme odaklanır.

        // [P0] UC-11: Cihazda Kayıtlı Oturum Varsa Zarif Tek Cümlelik Devam Satırı ("başka hesap"a basılsa bile geri dönülebilir)
        // [P0] UC-11: Cihazda Kayıtlı Oturum Varsa Zarif Tek Cümlelik Devam Satırı (Kişi adı ve rolü net, çift adı değil!)
        savedSession && savedSession.weddingCode && !isSwitchingAccount && h('div', { className: 'wedding-active-banner resume-line' },
          h('p', { className: 'resume-line-text' },
            'tekrar hoş geldin, ',
            h('span', { className: 'resume-line-name' }, savedSession.name)
            h('span', { className: 'resume-line-name' }, savedSession.name),
            h('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--ink-muted)', marginLeft: '6px' } },
              `(${formatRoleLabel(savedSession.role)})`
            )
          ),
          h('div', { className: 'resume-line-actions' },
            h('button', {
              type: 'button',
              className: 'resume-link resume-link--main',
              onClick: () => useAppStore.getState().resumeSession()
            }, 'devam et'),
            h('span', { className: 'resume-sep' }, '·'),
            h('button', {
              type: 'button',
              className: 'resume-link',
              onClick: () => useAppStore.getState().startSwitchAccount()
            }, 'başka hesap')
            }, 'başka hesap / kimlik değiştir')
          )
        ),

        // "başka hesap"a basıldığında açılan Geri Dönülebilir Hesap & Geçmiş Düğünler Seçicisi
        isSwitchingAccount && h('div', { className: 'wedding-active-banner resume-line' },
          savedSession && h('div', { style: { marginBottom: 'var(--sp-3)' } },
            h('p', { className: 'resume-line-text' },
              'aktif hesabına geri dön: ',
              h('span', { className: 'resume-line-name' }, savedSession.name),
              ` (${savedSession.weddingName || savedSession.weddingCode})`
            ),
            h('div', { className: 'resume-line-actions' },
              h('button', {
                type: 'button',
                className: 'resume-link resume-link--main',
                onClick: () => useAppStore.getState().resumeSession(savedSession)
              }, `← ${savedSession.name} hesabına geri dön`),
              h('span', { className: 'resume-sep' }, '·'),
              h('button', {
                type: 'button',
                className: 'resume-link',
                onClick: () => useAppStore.getState().cancelSwitchAccount()
              }, 'vazgeç')
            )
          ),
          historyList.length > 1 && h('div', { style: { marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-2)', borderTop: '0.5px solid var(--border-thin)' } },
            h('div', { className: 'manager-line-role', style: { marginBottom: 'var(--sp-2)' } }, 'önceki rollerim & geçmiş düğünler'),
            h('div', { className: 'resume-line-actions', style: { flexWrap: 'wrap', gap: 'var(--sp-3)' } },
              historyList.map(item => h('button', {
                key: item.key || item.id,
                type: 'button',
                className: 'resume-link',
                onClick: () => useAppStore.getState().resumeSession(item)
              }, `${item.name} · ${item.weddingName || item.weddingCode} (${formatRoleLabel(item.role)})`))
            )
          )
        ),

        // Sadece 2 Ana Sekme: Davetli Girişi & Yönetim
        h('div', { className: 'landing-tabs' },
          h('button', {
            type: 'button',
            className: `landing-tab-btn ${landingTab === 'guest' ? 'active' : ''}`,
            onClick: () => useAppStore.getState().setLandingTab('guest')
          }, 'Davetli Girişi'),
          h('button', {
            type: 'button',
            className: `landing-tab-btn ${landingTab === 'manage' ? 'active' : ''}`,
            onClick: () => useAppStore.getState().setLandingTab('manage')
          }, 'Yönetim')
        ),

        // Tab 1: Davetli Girişi (P0 Odaklı — Sıfır Re-render, Uncontrolled FormData)
        landingTab === 'guest' && h('form', { key: 'form-guest', onSubmit: onGuestSubmit, className: 'landing-tab-content active' },
          invalidLinkCode && !wedding ? h('div', { className: 'resume-line' },
            h('p', { className: 'resume-line-text' },
              `davet bağlantısı bulunamadı (${invalidLinkCode}) · aşağıdan düğün kodunu girebilirsiniz`
            )
          ) : null,
          wedding ? h('div', { className: 'wedding-active-banner resume-line' },
            h('p', { className: 'resume-line-text' },
              incomingRef === 'gelin' ? 'gelin davetiyesi · ' :
              incomingRef === 'damat' ? 'damat davetiyesi · ' :
              incomingRef === 'masa-qr' ? 'masa davetiyesi · ' : 'özel davet · ',
              h('span', { className: 'resume-line-name' }, wedding.name),
              incomingSharedBy ? ` (davet eden: ${incomingSharedBy})` : ''
            ),
            h('div', { className: 'resume-line-actions' },
              h('button', {
                type: 'button',
                className: 'resume-link',
                onClick: () => useAppStore.getState().cancelInvitation()
              }, 'farklı bir düğün kodu gir')
            )
          ) : null,
          h('div', { className: 'input-stack' },
            !wedding && h('div', { className: 'input-group' },
              h('label', { className: 'input-label' }, 'düğün kodu veya adı'),
              h('input', {
                className: 'input-field',
                name: 'guestCode',
                type: 'text',
                placeholder: 'ör. ayse-mehmet',
                defaultValue: '',
                required: true
              })
            ),
            h('div', { className: 'input-group' },
              h('label', { className: 'input-label' }, 'ad soyad'),
              h('input', {
                className: 'input-field',
                name: 'guestName',
                type: 'text',
                placeholder: 'adınız ve soyadınız',
                defaultValue: '',
                required: true
              })
            ),
            h('div', { className: 'input-group' },
              h('label', { className: 'input-label' }, 'düğün şifresi'),
              h('input', {
                className: 'input-field',
                name: 'guestPin',
                type: 'password',
                placeholder: 'şifreniz (ör. 1234)',
                defaultValue: '',
                required: true
              })
            ),
            // [P2] Kompakt Tek Satır Yasal Onay
            h('div', { className: 'consent-group' },
              h('label', { className: 'consent-checkbox-wrap' },
                h('input', {
                  type: 'checkbox',
                  name: 'guestConsent',
                  className: 'consent-checkbox',
                  defaultChecked: true
                }),
                h('span', { className: 'consent-text' },
                  h('span', { className: 'consent-link', onClick: (e) => { e.preventDefault(); useAppStore.getState().openLegalModal('kvkk'); } }, 'KVKK Aydınlatma Metni'),
                  ' ve ',
                  h('span', { className: 'consent-link', onClick: (e) => { e.preventDefault(); useAppStore.getState().openLegalModal('liability'); } }, 'Kullanıcı Sorumluluk Beyanı'),
                  '\'nı okudum, kabul ediyorum.'
                )
              )
            ),
            h('button', { type: 'submit', className: 'btn btn-primary btn-full mt-4' }, 'Düğüne Katıl ve Fotoğraf Yükle')
          )
        ),

        // Tab 2: Yönetim (Giriş Yap vs Yeni Düğün Kur — Sıfır Re-render, Uncontrolled FormData)
        landingTab === 'manage' && h('div', { className: 'landing-tab-content active' },
          h('div', { className: 'sub-toggle-group' },
            h('button', {
              type: 'button',
              className: `sub-toggle-btn ${manageMode === 'login' ? 'active' : ''}`,
              onClick: () => useAppStore.getState().setManageMode('login')
            }, 'Giriş Yap'),
            h('button', {
              type: 'button',
              className: `sub-toggle-btn ${manageMode === 'create' ? 'active' : ''}`,
              onClick: () => useAppStore.getState().setManageMode('create')
            }, 'Yeni Düğün Kur')
          ),

          manageMode === 'login' ? h('form', { key: 'form-manage-login', onSubmit: onManageSubmit },
            h('div', { className: 'input-stack' },
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'düğün kodu veya çift adı'),
                h('input', {
                  className: 'input-field',
                  name: 'mCode',
                  type: 'text',
                  placeholder: 'ör. ayse-mehmet veya Ayşe & Mehmet',
                  defaultValue: wedding?.slug || wedding?.code || '',
                  required: true
                })
              ),
              h('div', { className: 'input-group' },
                h('label', { className: 'input-label' }, 'yönetici şifresi'),
                h('input', {
                  className: 'input-field',
                  name: 'mPass',
                  type: 'password',
                  placeholder: 'yönetim şifresi (ör. 1234)',
                  defaultValue: '',
                  required: true
                })
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' } },
                h('div', { className: 'input-group' },
                  h('label', { className: 'input-label' }, 'adınız ', h('span', { className: 't-faint' }, '(opsiyonel)')),
                  h('label', { className: 'input-label' }, 'kişisel adınız soyadınız'),
                  h('input', {
                    className: 'input-field',
                    name: 'mName',
                    type: 'text',
                    placeholder: 'ör. Emre Yılmaz',
                    placeholder: 'ör. Mehmet Yılmaz veya Ayşe Kaya',
                    defaultValue: ''
                  })
                ),
                h('div', { className: 'input-group' },
                  h('label', { className: 'input-label' }, 'rolünüz'),
                  h('label', { className: 'input-label' }, 'görev ve sorumluluk rolünüz'),
                  h('select', {
                    className: 'input-field',
                    name: 'mRole',
                    defaultValue: 'owner'
                    defaultValue: 'groom_owner'
                  },
                    h('option', { value: 'owner' }, 'Düğün Sahibi'),
                    h('option', { value: 'photographer' }, 'Fotoğrafçı'),
                    h('option', { value: 'bestman' }, 'Sağdıç / Yardımcı')
                    h('option', { value: 'groom_owner' }, 'Düğün Sahibi · Damat'),
                    h('option', { value: 'bride_owner' }, 'Düğün Sahibi · Gelin'),
                    h('option', { value: 'member_manager' }, 'Yetkili Üye · Galeri Moderatörü'),
                    h('option', { value: 'bestman' }, 'Sağdıç / Nedime · Yardımcı'),
                    h('option', { value: 'photographer' }, 'Düğün Fotoğrafçısı')
                  )
                )
              ),
              h('button', { type: 'submit', className: 'btn btn-primary btn-full mt-4' }, 'Yönetim Paneline Giriş Yap')
            )
          ) : h('form', { key: 'form-manage-create', onSubmit: onCreateSubmit },
            h('div', { className: 'input-stack' },
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' } },
                h('div', { className: 'input-group' },
                  h('label', { className: 'input-label' }, 'yönetici ad soyad'),
                  h('label', { className: 'input-label' }, 'sizin adınız soyadınız'),
                  h('input', {
                    className: 'input-field',
                    name: 'cManagerName',
                    type: 'text',
                    placeholder: 'ör. Emre Yılmaz',
                    placeholder: 'ör. Mehmet Yılmaz',
                    defaultValue: '',
                    required: true
                  })
                ),
                h('div', { className: 'input-group' },
                  h('label', { className: 'input-label' }, 'yönetici rolü'),
                  h('label', { className: 'input-label' }, 'düğündeki göreviniz'),
                  h('select', {
                    className: 'input-field',
                    name: 'cManagerRole',
                    defaultValue: 'owner'
                    defaultValue: 'groom_owner'
                  },
                    h('option', { value: 'owner' }, 'Düğün Sahibi'),
                    h('option', { value: 'photographer' }, 'Fotoğrafçı'),
                    h('option', { value: 'bestman' }, 'Sağdıç / Yardımcı')
                    h('option', { value: 'groom_owner' }, 'Düğün Sahibi · Damat'),
                    h('option', { value: 'bride_owner' }, 'Düğün Sahibi · Gelin'),
                    h('option', { value: 'photographer' }, 'Düğün Fotoğrafçısı'),
                    h('option', { value: 'bestman' }, 'Sağdıç / Nedime · Yardımcı')
                  )
                )
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--sp-3)' } },
                h('div', { className: 'input-group' },
                  h('label', { className: 'input-label' }, 'düğün / çift adı'),
                  h('input', {
                    className: 'input-field',
                    name: 'cName',
                    type: 'text',
                    placeholder: 'ör. Zeynep & Can',
                    defaultValue: '',
                    required: true
                  })
                ),
                h('div', { className: 'input-group' },
                  h('label', { className: 'input-label' }, 'tarih'),
                  h('input', {
                    className: 'input-field',
                    name: 'cDate',
                    type: 'date',
                    defaultValue: todayIso,
                    required: true
                  })
                )
              ),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' } },
                h('div', { className: 'input-group' },
                  h('label', { className: 'input-label' }, 'yönetici şifresi belirle'),
                  h('input', {
                    className: 'input-field',
                    name: 'cOwnerPin',
                    type: 'password',
                    placeholder: 'ör. 1234',
                    defaultValue: '',
                    required: true
                  })
                ),
                h('div', { className: 'input-group' },
                  h('label', { className: 'input-label' }, 'davetli şifresi belirle'),
                  h('input', {
                    className: 'input-field',
                    name: 'cGuestPin',
                    type: 'password',
                    placeholder: 'ör. 1234',
                    defaultValue: '',
                    required: true
                  })
                )
              ),
              h('div', { className: 'consent-group' },
                h('label', { className: 'consent-checkbox-wrap' },
                  h('input', {
                    type: 'checkbox',
                    name: 'cConsent',
                    className: 'consent-checkbox',
                    defaultChecked: true
                  }),
                  h('span', { className: 'consent-text' },
                    h('span', { className: 'consent-link', onClick: (e) => { e.preventDefault(); useAppStore.getState().openLegalModal('kvkk'); } }, 'KVKK Aydınlatma Metni'),
                    ' ve ',
                    h('span', { className: 'consent-link', onClick: (e) => { e.preventDefault(); useAppStore.getState().openLegalModal('liability'); } }, 'Sorumluluk Beyanı'),
                    '\'nı onaylıyorum.'
                  )
                )
              ),
              h('button', { type: 'submit', className: 'btn btn-primary btn-full mt-4' }, 'Kayıt Ol ve Düğünü Başlat')
            )
          )
        )
      )
    )
  );
}
