import type { Team } from '../lib/types';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<Size, { outer: string; font: string; fontSize: number }> = {
  xs: { outer: 'w-6 h-6 rounded-sm',  font: 'font-bold',      fontSize: 8  },
  sm: { outer: 'w-8 h-8 rounded',     font: 'font-bold',      fontSize: 10 },
  md: { outer: 'w-10 h-10 rounded',   font: 'font-extrabold', fontSize: 11 },
  lg: { outer: 'w-14 h-14 rounded-md',font: 'font-extrabold', fontSize: 13 },
  xl: { outer: 'w-20 h-20 rounded-lg',font: 'font-black',     fontSize: 16 },
};

type Props = {
  team: Team;
  size?: Size;
  className?: string;
};

// Compute luminance of a hex color to decide text contrast
function isDark(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.4;
}

export default function TeamCrest({ team, size = 'md', className = '' }: Props) {
  const { outer, font, fontSize } = SIZE_MAP[size];

  if (team.crest_url) {
    return (
      <img
        src={team.crest_url}
        alt={team.name}
        className={`${outer} object-contain flex-shrink-0 ${className}`}
      />
    );
  }

  const primaryColor = team.color_primary || '#1F2937';
  const dark = isDark(primaryColor);
  const textColor = dark ? '#FFFFFF' : '#09090E';

  return (
    <div
      className={`${outer} flex-shrink-0 flex items-center justify-center font-condensed ${font} tracking-tight flex-shrink-0 ${className}`}
      style={{
        background: primaryColor,
        color: textColor,
        fontSize,
        letterSpacing: '-0.02em',
      }}
      title={team.name}
      aria-label={team.name}
    >
      {team.abbreviation}
    </div>
  );
}
