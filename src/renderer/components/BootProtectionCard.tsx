import {
  BOOT_CHECK_GUIDES,
  BOOT_HABITS,
  BOOT_PROTECTION_LIMITS,
  bootBadgeLabel,
  bootBadgeTone,
  bootDetailsLine,
  type BootProtection,
} from '../../shared/bootProtection';

/**
 * 起動の守りの点検 (2026-11-16)。
 *
 * 札は「読んで無効だった」ときだけ警告色 —— 見ていない端末について警告を出さない
 * (文面と色は `shared/bootProtection.ts` が 1 か所で持つ)。確かめ方は畳まずに全部出す:
 * 利用者は自分の端末の種類を探して読むだけで、押す物は 1 つも無い。
 */
export function BootProtectionCard({ detection }: { detection: BootProtection }) {
  return (
    <div className="card" style={{ gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className={`badge ${bootBadgeTone(detection)}`} data-boot-badge={detection}>
          {bootBadgeLabel(detection)}
        </span>
        <span style={{ fontSize: 13 }} data-boot-details>
          {bootDetailsLine(detection)}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }} data-boot-limits>
        {BOOT_PROTECTION_LIMITS}
      </p>
      {BOOT_CHECK_GUIDES.map((guide) => (
        <div key={guide.device} data-boot-guide={guide.device}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{guide.device}</div>
          <ol style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 12 }}>
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ))}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>どの端末でも</div>
        <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 12 }} data-boot-habits>
          {BOOT_HABITS.map((habit) => (
            <li key={habit}>{habit}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
