import { useMemo } from 'react';
import {
  buildIsoModel,
  type FloorSpec,
  type IsoModel,
  type RoomKind,
} from '../../shared/buildingIso';

/** 用途区分ごとの塗り分け。CSS 変数ではなく固定色 (SVG を単体で切り出せるように)。 */
const KIND_COLOR: Record<RoomKind, { fill: string; stroke: string }> = {
  workshop: { fill: 'rgba(74,164,86,0.22)', stroke: '#4aa456' },
  retail: { fill: 'rgba(56,150,190,0.22)', stroke: '#3896be' },
  water: { fill: 'rgba(56,150,190,0.34)', stroke: '#2b7fa6' },
  core: { fill: 'rgba(200,90,60,0.22)', stroke: '#c85a3c' },
  other: { fill: 'rgba(140,155,165,0.20)', stroke: '#8c9ba5' },
};

const pts = (ps: readonly { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');

export interface BuildingIsoProps {
  readonly widthM: number;
  readonly depthM: number;
  readonly floors: readonly FloorSpec[];
  /** 図の高さ (px)。既定 320。 */
  readonly height?: number;
  readonly caption?: string;
}

/**
 * 分解アイソメの立体プレビュー。
 *
 * 座標計算は `shared/buildingIso` の純関数が担当し、この component は
 * 受け取った投影済み座標を描くだけ。室面積の合計が外形と合わない階が
 * あれば、黙って描かずに**警告として表示する** (図と数字がズレたまま
 * それらしく見えるのが一番まずい)。
 */
export function BuildingIso({ widthM, depthM, floors, height = 320, caption }: BuildingIsoProps) {
  const model: IsoModel = useMemo(
    () => buildIsoModel(widthM, depthM, floors, { originX: 0, originY: 0 }),
    [widthM, depthM, floors],
  );

  if (model.floors.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-mute)', padding: '8px 0' }}>
        寸法が未入力のため立体図を描けません。
      </div>
    );
  }

  const pad = 26;
  const vb = {
    x: model.bounds.minX - pad,
    y: model.bounds.minY - pad,
    w: model.bounds.maxX - model.bounds.minX + pad * 2,
    h: model.bounds.maxY - model.bounds.minY + pad * 2,
  };

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          height={height}
          style={{ display: 'block', maxWidth: '100%', height, margin: '0 auto' }}
          role="img"
          aria-label={`建物の分解アイソメ立体図（${model.floors.length} 層）${caption === undefined ? '' : `。${caption}`}`}
        >
          {model.leaders.map((seg, i) => (
            <line
              key={`ld-${i}`}
              x1={seg[0].x}
              y1={seg[0].y}
              x2={seg[1].x}
              y2={seg[1].y}
              stroke="var(--border)"
              strokeWidth={0.7}
              strokeDasharray="3 4"
            />
          ))}
          {model.floors.map((f) => (
            <g key={f.name}>
              <polygon points={pts(f.sideSouth)} fill="rgba(0,0,0,0.16)" stroke="var(--text-mute)" strokeWidth={0.8} />
              <polygon points={pts(f.sideEast)} fill="rgba(0,0,0,0.24)" stroke="var(--text-mute)" strokeWidth={0.8} />
              <polygon points={pts(f.outline)} fill="var(--panel)" stroke="var(--text)" strokeWidth={1.4} />
              {f.rooms.map((r, i) => (
                <g key={`${f.name}-${i}`}>
                  <polygon
                    points={pts(r.points)}
                    fill={KIND_COLOR[r.kind].fill}
                    stroke={KIND_COLOR[r.kind].stroke}
                    strokeWidth={1}
                  />
                  <text x={r.label.x} y={r.label.y - 2} textAnchor="middle" fontSize={8} fill="var(--text)">
                    {r.name}
                  </text>
                  <text x={r.label.x} y={r.label.y + 8} textAnchor="middle" fontSize={7} fill="var(--text-mute)">
                    {r.areaSqm.toLocaleString()} ㎡
                  </text>
                </g>
              ))}
              <text x={f.outline[0].x - 108} y={f.outline[0].y + 6} fontSize={12} fill="var(--text)">
                {f.name}
              </text>
              <text x={f.outline[0].x - 108} y={f.outline[0].y + 19} fontSize={8} fill="var(--text-mute)">
                {f.outlineSqm.toLocaleString()} ㎡
              </text>
            </g>
          ))}
        </svg>
      </div>
      {!model.allFit && (
        <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>
          室の面積合計が階の外形と一致していません（
          {model.floors
            .filter((f) => !f.fits)
            .map((f) => `${f.name}: 室 ${f.roomsSqm} ㎡ / 外形 ${f.outlineSqm} ㎡`)
            .join('、')}
          ）。図に隙間か重なりがあります。
        </div>
      )}
      {caption !== undefined && (
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 6 }}>{caption}</div>
      )}
    </div>
  );
}
