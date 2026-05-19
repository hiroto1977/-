import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function TaxAccountantPage() {
  return (
    <ShigyoConsole
      serviceId="tax-accountant"
      serviceLabel="税理士"
      snapshot={SNAPSHOT.taxAccountant}
    />
  );
}
