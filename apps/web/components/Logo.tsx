export default function Logo({ size = 40, wordmark = true }: { size?: number; wordmark?: boolean }) {
  const markSize = Math.max(16, Math.round(size * 0.52));
  const radius = Math.max(8, Math.round(size * 0.26));

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="relative flex shrink-0 items-center justify-center bg-black ring-1 ring-inset ring-line"
        style={{ width: size, height: size, borderRadius: radius }}
      >
        <svg
          width={markSize}
          height={markSize}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M10 16H54V28H10V16Z" fill="white" />
          <path d="M10 30H42V42H10V30Z" fill="white" fillOpacity="0.92" />
          <path d="M22 44H54V56H22V44Z" fill="white" fillOpacity="0.84" />
        </svg>
      </span>
      {wordmark && (
        <span
          className="font-semibold tracking-[-0.02em] text-fg"
          style={{ fontSize: Math.max(15, Math.round(size * 0.5)) }}
        >
          StackPay
        </span>
      )}
    </span>
  );
}
