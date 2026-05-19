import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function LawyerPage() {
  return (
    <ShigyoConsole
      serviceId="lawyer"
      serviceLabel="弁護士"
      snapshot={SNAPSHOT.lawyer}
      disclaimer="本画面は記録の表示のみで、法的助言ではありません。具体的な法的判断はご担当弁護士にご相談ください。"
    />
  );
}
