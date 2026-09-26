import './web-shim';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { isFramed, renderFrameRefusal } from './security/frameGuard';
import './styles.css';
import { applySavedTheme } from './theme';

// 配色 (ライト / ダーク / OS に合わせる) は描画より先に決める —— 保存した選択と違う色の一瞬を作らない (パス 317)。
applySavedTheme();

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
