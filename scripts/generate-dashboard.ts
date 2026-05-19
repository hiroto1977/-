// Generate ~/.local/business-hub/data/dashboard.html from a real snapshot.
// Run with: npx tsx scripts/generate-dashboard.ts
import { exportDashboardImpl } from '../src/main/clients/stocks';

async function main() {
  const r = await exportDashboardImpl(
    { token: '', payload: {} },
    { now: () => new Date() },
  );
  console.log('wrote:', r.path, '(' + (r.bytes / 1024).toFixed(1) + ' KB)');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
