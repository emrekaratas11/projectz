import { h, useEffect } from '../react.js';
import { useStore, useAppStore } from '../store/index.js';
import { LandingView } from './LandingView.js';
import { OwnerView } from './OwnerView.js';
import { InviteeView } from './InviteeView.js';
import { LinkShareView } from './LinkShareView.js';
import {
  AuthModal,
  LegalModal,
  PhotoLightboxModal,
  OwnerSettingsSheet,
  GuestNotifySheet,
  HierarchySheet
} from './Modals.js';

function ToastOverlay() {
  const toasts = useStore(s => s.toasts);
  return h('div', { className: 'toast-container' },
    (toasts || []).map(t => h('div', { key: t.id, className: 'toast' }, t.message))
  );
}

export function App() {
  // App only subscribes to activeScreen so modals, toasts, and inputs never re-render the root router
  const activeScreen = useStore(s => s.activeScreen);

  useEffect(() => {
    if (useAppStore.getState().activeScreen === 'SPLASH') {
      useAppStore.getState().bootstrap();
    }
  }, []);

  return h('div', { className: 'app-container' },
    // Screen Router (falls back to LandingView if SPLASH so the splash screen never blocks)
    (activeScreen === 'ROLE_SELECT' || activeScreen === 'SPLASH') && h(LandingView),
    activeScreen === 'OWNER_PANEL' && h(OwnerView),
    activeScreen === 'INVITEE_PANEL' && h(InviteeView),
    activeScreen === 'LINK_SHARE' && h(LinkShareView),

    // Isolated Toast Notifications
    h(ToastOverlay),

    // Modals & Secondary Drawers (each subscribes only to its own open boolean)
    h(AuthModal),
    h(LegalModal),
    h(PhotoLightboxModal),
    h(OwnerSettingsSheet),
    h(GuestNotifySheet),
    h(HierarchySheet)
  );
}
