import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function LaborConsultantPage() {
  return <ShigyoConsole serviceId="labor-consultant" snapshot={SNAPSHOT.laborConsultant} label="社労士" />;
}
