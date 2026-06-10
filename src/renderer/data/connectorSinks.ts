/**
 * コネクタ実実行の実 IO シンク (アダプタ層)。
 *
 * `connectorExecution.ts` の純ロジックが要求する {@link ConnectorSinks} を、
 * アプリの実際の永続化基盤へ束ねる薄いアダプタ:
 *   - library  → IndexedDB blob ストア (`library/library.ts`)
 *   - storage  → レコードストア (`data/store.ts`)
 * いずれもローカル永続化のため Electron / ブラウザ版の双方で動作する。
 * IO のみのためユニットテスト対象外 (純ロジックは connectorExecution 側で網羅)。
 */

import { getLibrary } from '../library/library';
import { getRecordStore } from './store';
import type { ConnectorSinks } from './connectorExecution';

export const realConnectorSinks: ConnectorSinks = {
  async putLibrary(serviceId, filename, mime, body) {
    await getLibrary().put(serviceId, filename, mime, new Blob([body], { type: mime }));
  },
  async insertStorage(collection, record) {
    await getRecordStore().insert(collection, record);
  },
};
