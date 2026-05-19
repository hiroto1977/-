import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function LaborConsultantPage() {
  return (
    <ShigyoConsole
      serviceId="labor-consultant"
      serviceLabel="社労士"
      snapshot={SNAPSHOT.laborConsultant}
    />
  );
}
