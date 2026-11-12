import { SNAPSHOT } from '../data/snapshot';
import { ShigyoConsole } from '../components/ShigyoConsole';

export function CpaPage() {
  return <ShigyoConsole serviceId="cpa" snapshot={SNAPSHOT.cpa} label="公認会計士" />;
}
