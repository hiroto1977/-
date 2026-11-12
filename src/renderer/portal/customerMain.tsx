/**
 * カスタマーポータルの入口 (顧客へ配る `dist/portal-customer.html` · 2026-11-11)。
 *
 * アプリの画面は 1 つも入れない (台帳 `shared/portal.mamori` の `CUSTOMER_SCREENS` はどれも会社が載せる頁)。
 * 端末に何も残さないので、消す口も要らない。
 */
import '../styles.css';
import { mountPortal } from './portalEntry';

mountPortal('customer', {});
