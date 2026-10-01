import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function TaxAccountantPage() {
  return <ShigyoConsole serviceId="tax-accountant" snapshot={SNAPSHOT.taxAccountant} label="税理士" />;
}
