import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function LawyerPage() {
  return (
    <ShigyoConsole
      serviceId="lawyer"
      snapshot={SNAPSHOT.lawyer}
      label="弁護士"
      disclaimer="本画面は連携先の弁護士との連絡・書類・請求を整理するための管理機能です。ここに表示・入力される情報は法律相談や法的助言の代替ではありません。具体的な法律問題は必ず弁護士に直接ご相談ください。"
    />
  );
}
