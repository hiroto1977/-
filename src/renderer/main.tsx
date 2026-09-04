import './web-shim';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { isFramed, renderFrameRefusal } from './security/frameGuard';
import './styles.css';

// 描画より先に判定する。React を立ち上げてから消すと、消えるまでのあいだ
// 押せてしまう (クリックジャッキングは 1 クリックで足りる)。
if (isFramed()) {
  renderFrameRefusal(document, window.location.href);
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
