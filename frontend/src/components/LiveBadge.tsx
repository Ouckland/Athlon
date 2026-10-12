type Props = {
  minute: number;
  addedTime?: number | null;
  size?: 'sm' | 'md';
};

export default function LiveBadge({ minute, addedTime, size = 'md' }: Props) {
  const isSm = size === 'sm';
  const minuteDisplay = addedTime ? `${minute}+${addedTime}` : `${minute}`;

  return (
    <div className={`flex items-center gap-1.5 ${isSm ? 'gap-1' : ''}`}>
      <span className="relative flex items-center justify-center">
        <span
          className="absolute inline-flex rounded-full bg-live animate-live-ring"
          style={{ width: isSm ? 8 : 10, height: isSm ? 8 : 10 }}
        />
        <span
          className="relative inline-flex rounded-full bg-live animate-live-pulse"
          style={{ width: isSm ? 6 : 8, height: isSm ? 6 : 8 }}
        />
      </span>
      <span
        className={`font-condensed font-bold tracking-widest text-live ${isSm ? 'text-xs' : 'text-sm'}`}
      >
        LIVE
      </span>
      <span
        className={`font-mono text-text-2 ${isSm ? 'text-xs' : 'text-sm'}`}
      >
        {minuteDisplay}'
      </span>
    </div>
  );
}
