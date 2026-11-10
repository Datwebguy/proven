/** Proven mark: an open loop (memory that keeps going) around a check whose stroke rises to a point. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="proven-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B5F59" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#proven-g)" />
      <path d="M32 12a20 20 0 1 0 20 20" fill="none" stroke="#fff" strokeOpacity=".38" strokeWidth="4" strokeLinecap="round" />
      <path className="logo-check" d="M21 33.5l7 7L44 22" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44" cy="22" r="4.2" fill="#fff" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <Logo />
      <span>Proven</span>
    </span>
  );
}
