import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function JudicialScrivenerPage() {
  return (
    <ShigyoConsole
      serviceId="judicial-scrivener"
      serviceLabel="司法書士"
      snapshot={SNAPSHOT.judicialScrivener}
    />
  );
}
