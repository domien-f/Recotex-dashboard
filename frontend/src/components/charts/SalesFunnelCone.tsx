import { useState } from "react";
import { formatNumber, formatPercent } from "@/lib/utils";

interface FunnelStage {
  label: string;
  value: number;
  color: string;
  colorDark: string;
  conversion?: number; // conversion from previous stage
}

interface Props {
  stages: FunnelStage[];
}

const TOP_WIDTH = 320;
const MIN_WIDTH = 130;
const STAGE_H = 130;
const SIDE_PAD = 110; // breathing room for outside labels
const TOP_PAD = 22;
const BOTTOM_PAD = 20;

export function SalesFunnelCone({ stages }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(stages[0]?.value || 1, 1);

  const svgW = TOP_WIDTH + SIDE_PAD * 2;
  const svgH = stages.length * STAGE_H + TOP_PAD + BOTTOM_PAD;
  const cx = svgW / 2;

  // perceptual scaling so small numbers stay readable
  const widths = stages.map((s) =>
    Math.max(MIN_WIDTH, TOP_WIDTH * Math.pow(Math.max(0, s.value) / max, 0.5))
  );
  const bottomWidths = [
    ...widths.slice(1),
    Math.max(40, widths[widths.length - 1] * 0.5),
  ];

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto block w-full max-w-[640px]"
        style={{ overflow: "visible" }}
      >
        <defs>
          {stages.map((s, i) => (
            <linearGradient key={`grad-${i}`} id={`grad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.96" />
              <stop offset="100%" stopColor={s.colorDark} stopOpacity="1" />
            </linearGradient>
          ))}
          {stages.map((_, i) => (
            <linearGradient key={`shine-${i}`} id={`shine-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="48%" stopColor="#ffffff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          ))}
          <filter id="funnel-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
            <feOffset dx="0" dy="6" />
            <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {stages.map((s, i) => {
          const topW = widths[i];
          const botW = bottomWidths[i];
          const y = TOP_PAD + i * STAGE_H;
          const isHover = hover === i;
          const lift = isHover ? -3 : 0;

          const x1 = cx - topW / 2;
          const x2 = cx + topW / 2;
          const x3 = cx + botW / 2;
          const x4 = cx - botW / 2;
          const path = `M ${x1} ${y} L ${x2} ${y} L ${x3} ${y + STAGE_H} L ${x4} ${y + STAGE_H} Z`;
          const rimRy = Math.max(5, Math.min(9, topW * 0.025));

          // Outside-label anchors at the transition line (top of this band)
          const leftAnchorX = cx - TOP_WIDTH / 2 - 14;
          const rightAnchorX = cx + TOP_WIDTH / 2 + 14;

          // Inside-label sizing — value gets smaller if the band is narrow
          const midW = (topW + botW) / 2;
          const valueFontSize = midW < 130 ? 18 : 24;
          const labelFontSize = midW < 130 ? 11 : 12;

          return (
            <g
              key={i}
              transform={`translate(0, ${lift})`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer", transition: "transform 200ms cubic-bezier(.4,0,.2,1)" }}
            >
              {/* Body */}
              <path d={path} fill={`url(#grad-${i})`} filter="url(#funnel-shadow)" />
              {/* Top rim ellipse */}
              <ellipse cx={cx} cy={y} rx={topW / 2} ry={rimRy} fill={s.color} opacity={0.55} />
              <ellipse
                cx={cx}
                cy={y - 1}
                rx={topW / 2}
                ry={rimRy}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={isHover ? 0.55 : 0.32}
                strokeWidth={1}
              />
              {/* Shine */}
              <path d={path} fill={`url(#shine-${i})`} pointerEvents="none" />

              {/* Inside labels */}
              <text
                x={cx}
                y={y + STAGE_H / 2 - 6}
                textAnchor="middle"
                fontSize={labelFontSize}
                fontWeight="600"
                fill="#ffffff"
                style={{ letterSpacing: "0.02em", textShadow: "0 1px 2px rgba(0,0,0,0.30)" }}
                pointerEvents="none"
              >
                {s.label}
              </text>
              <text
                x={cx}
                y={y + STAGE_H / 2 + 16}
                textAnchor="middle"
                fontSize={valueFontSize}
                fontWeight="800"
                fill="#ffffff"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.35)" }}
                pointerEvents="none"
              >
                {formatNumber(s.value)}
              </text>

              {/* Outside transition annotations (skip top stage) */}
              {i > 0 && (
                <g pointerEvents="none">
                  {/* Subtle leader lines from band edge to label area */}
                  <line
                    x1={cx - topW / 2}
                    y1={y}
                    x2={leftAnchorX + 4}
                    y2={y}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                  <line
                    x1={cx + topW / 2}
                    y1={y}
                    x2={rightAnchorX - 4}
                    y2={y}
                    stroke="#cbd5e1"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />

                  {/* Drop-off (left) */}
                  <text
                    x={leftAnchorX}
                    y={y - 3}
                    textAnchor="end"
                    fontSize="9.5"
                    fontWeight="600"
                    fill="#94a3b8"
                    style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}
                  >
                    DROP-OFF
                  </text>
                  <text
                    x={leftAnchorX}
                    y={y + 12}
                    textAnchor="end"
                    fontSize="13"
                    fontWeight="800"
                    fill="#ef4444"
                  >
                    −{formatNumber(stages[i - 1].value - s.value)}
                  </text>

                  {/* Conversion pill (right) */}
                  {s.conversion !== undefined && (
                    <g transform={`translate(${rightAnchorX}, ${y})`}>
                      <rect
                        x="0"
                        y="-13"
                        width="68"
                        height="26"
                        rx="13"
                        fill="#ffffff"
                        stroke={s.color}
                        strokeWidth="1.5"
                      />
                      <text
                        x="34"
                        y="5"
                        textAnchor="middle"
                        fontSize="11.5"
                        fontWeight="800"
                        fill={s.colorDark}
                      >
                        {formatPercent(s.conversion)}
                      </text>
                    </g>
                  )}
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
