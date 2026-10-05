import { seriesColor } from './chartColors';

export interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
}

/** Vertical columns, rendered right-to-left (first item rightmost) for RTL time order. */
export function BarChart({ data, height = 150 }: BarChartProps) {
  if (data.length === 0) return null;

  const slot = 30;
  const barWidth = 14;
  const chartTop = 14;
  const baseline = height;
  const labelY = baseline + 18;
  const width = data.length * slot;
  const svgHeight = baseline + 30;

  const max = Math.max(1, ...data.map((d) => d.value));

  const roundedTopRect = (x: number, y: number, w: number, h: number, r: number) => {
    const rad = Math.min(r, h, w / 2);
    return [
      `M ${x} ${y + rad}`,
      `Q ${x} ${y} ${x + rad} ${y}`,
      `L ${x + w - rad} ${y}`,
      `Q ${x + w} ${y} ${x + w} ${y + rad}`,
      `L ${x + w} ${y + h}`,
      `L ${x} ${y + h}`,
      'Z',
    ].join(' ');
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={svgHeight} role="img">
        <line
          x1={0}
          y1={baseline + 0.5}
          x2={width}
          y2={baseline + 0.5}
          style={{ stroke: 'var(--border)' }}
        />
        {data.map((d, i) => {
          const cx = width - slot * (i + 0.5);
          const h = (d.value / max) * (baseline - chartTop);
          const x = cx - barWidth / 2;
          const y = baseline - h;
          return (
            <g key={i}>
              <path d={roundedTopRect(x, y, barWidth, h, 3)} style={{ fill: seriesColor(0) }} />
              <text x={cx} y={labelY} textAnchor="middle" className="bar-label">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
