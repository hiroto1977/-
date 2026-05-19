import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function PatentAttorneyPage() {
  return (
    <ShigyoConsole
      serviceId="patent-attorney"
      serviceLabel="弁理士"
      snapshot={SNAPSHOT.patentAttorney}
      disclaimer="本画面は記録の表示のみで、知財に関する法的助言ではありません。出願・権利化判断はご担当弁理士にご相談ください。"
    />
  );
}
