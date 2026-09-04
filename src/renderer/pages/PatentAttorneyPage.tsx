import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function PatentAttorneyPage() {
  return (
    <ShigyoConsole
      serviceId="patent-attorney"
      snapshot={SNAPSHOT.patentAttorney}
      label="弁理士"
      disclaimer="本画面は連携先の弁理士との連絡・書類・請求を整理するための管理機能です。ここに表示・入力される情報は特許・商標等の専門的助言の代替ではありません。出願・権利化の判断は必ず弁理士に直接ご相談ください。"
    />
  );
}
