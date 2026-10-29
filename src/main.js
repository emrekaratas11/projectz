import { React, ReactDOM, h } from './react.js';
import { App } from './components/App.js';
import { useAppStore } from './store/index.js';

// Bootstrap immediately so activeScreen transitions out of SPLASH synchronously
try {
  useAppStore.getState().bootstrap();
} catch (err) {
  console.error('Bootstrap error:', err);
  useAppStore.setState({ activeScreen: 'ROLE_SELECT' });
}

const container = document.getElementById('app');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(h(App));
}
