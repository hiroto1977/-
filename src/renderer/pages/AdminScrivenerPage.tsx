import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function AdminScrivenerPage() {
  return (
    <ShigyoConsole
      serviceId="admin-scrivener"
      serviceLabel="行政書士"
      snapshot={SNAPSHOT.adminScrivener}
    />
  );
}
