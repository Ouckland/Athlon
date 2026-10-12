type Props = {
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
  accent?: boolean;
};

export default function SectionHeader({ title, subtitle, action, accent }: Props) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        {accent && (
          <span className="block w-0.5 h-4 flex-shrink-0 rounded-full" style={{ background: '#22C55E' }} />
        )}
        <div>
          <h2 className="font-condensed font-bold text-[15px] text-text-1 tracking-[0.08em] uppercase leading-none">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[10px] font-mono mt-0.5" style={{ color: '#454E62' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-1 text-[11px] font-mono transition-colors duration-150"
          style={{ color: '#454E62' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#828CA4')}
          onMouseLeave={e => (e.currentTarget.style.color = '#454E62')}
        >
          {action.label}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M3 2l4 3-4 3" />
          </svg>
        </button>
      )}
    </div>
  );
}
