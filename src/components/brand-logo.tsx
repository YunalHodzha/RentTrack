import Svg, { Polyline, Line, Rect } from 'react-native-svg';

/**
 * Имотник brand mark (vector). Single-color, theming-aware: pass `color` from
 * the theme (emerald on light, mint on dark). Roof chevron above a stylized „И".
 */
export function BrandLogo({ size = 68, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Polyline points="300,452 512,300 724,452" fill="none" stroke={color}
        strokeWidth={74} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={408} y1={762} x2={616} y2={546} stroke={color}
        strokeWidth={74} strokeLinecap="round" />
      <Rect x={372} y={540} width={72} height={226} rx={22} fill={color} />
      <Rect x={580} y={540} width={72} height={226} rx={22} fill={color} />
    </Svg>
  );
}
