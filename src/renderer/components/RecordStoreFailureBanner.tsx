/**
 * **端末が業務レコードの読み書きを断ったことを、画面の上端で 1 行だけ言う。**
 *
 * 置き場所は `App.tsx` の内容領域の**先頭 1 か所**。理由は `ManualDataSection`
 * と同じで、画面ごとに貼って回ると必ずどれか 1 つが漏れるため。断られる原因は
 * たいてい端末側 (容量・プライベートモード・接続) なので、**どの画面に居ても
 * 同じ打ち手**になる —— 画面ごとの欄に散らす意味が無い。
 *
 * 画面の描画エラー境界 (`PageErrorBoundary`) の**外**に置く。中に置くと、
 * 保存できない状態が原因で画面が落ちたときに報せも一緒に消える。
 *
 * 閉じられるようにする。直った後も残ると、次の失敗と見分けが付かない。
 */
import { useEffect, useState } from 'react';
import {
  clearRecordStoreFailure,
  currentRecordStoreFailure,
  subscribeRecordStoreFailure,
  type RecordStoreFailure,
} from '../data/recordStoreFailure';

export function RecordStoreFailureBanner() {
  // マウント前に届いた 1 件も出す (最初の読み込みで断られる場合がいちばん多い)。
  const [failure, setFailure] = useState<RecordStoreFailure | null>(currentRecordStoreFailure);
  useEffect(() => subscribeRecordStoreFailure(setFailure), []);

  if (failure === null) return null;
  return (
    <div
      role="alert"
      data-record-store-failure={failure.op}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        margin: '0 0 12px',
        padding: '10px 12px',
        border: '1px solid #ef4444',
        borderRadius: 6,
        background: 'rgba(239, 68, 68, 0.08)',
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      <span aria-hidden="true">⛔</span>
      <span style={{ flex: 1 }}>{failure.message}</span>
      <button
        type="button"
        onClick={() => clearRecordStoreFailure()}
        style={{ fontSize: 11, flexShrink: 0 }}
      >
        閉じる
      </button>
    </div>
  );
}
