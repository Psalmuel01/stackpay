type Slice = {
  label: string;
  value: number;
  color: string;
};

export default function DonutBreakdown({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const safeTotal = total > 0 ? total : 1;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="12"
            fill="none"
          />
          {slices.map((slice) => {
            const length = (slice.value / safeTotal) * circumference;
            const dashOffset = circumference - offset;
            offset += length;

            return (
              <circle
                key={slice.label}
                cx="60"
                cy="60"
                r={radius}
                stroke={slice.color}
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={dashOffset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/40">Invoices</div>
          <div className="mt-1 text-2xl font-semibold text-white">{total}</div>
        </div>
      </div>

      <div className="grid flex-1 gap-3">
        {slices.map((slice) => (
          <div
            key={slice.label}
            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-sm text-white/70">{slice.label}</span>
            </div>
            <span className="text-sm font-medium text-white">{slice.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
