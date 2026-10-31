import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function SmeConsultantPage() {
  return (
    <ShigyoConsole serviceId="sme-consultant" snapshot={SNAPSHOT.smeConsultant} label="中小企業診断士" />
  );
}
