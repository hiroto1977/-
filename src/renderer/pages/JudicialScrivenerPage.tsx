import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function JudicialScrivenerPage() {
  return (
    <ShigyoConsole
      serviceId="judicial-scrivener"
      snapshot={SNAPSHOT.judicialScrivener}
      label="司法書士"
    />
  );
}
