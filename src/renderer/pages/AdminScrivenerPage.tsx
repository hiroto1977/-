import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function AdminScrivenerPage() {
  return (
    <ShigyoConsole serviceId="admin-scrivener" snapshot={SNAPSHOT.adminScrivener} label="行政書士" />
  );
}
