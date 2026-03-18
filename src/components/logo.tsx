export default function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="inline-block"
    >
      {/* Antenna */}
      <line x1="16" y1="2" x2="16" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="2" r="1.5" fill="currentColor" />

      {/* Head */}
      <rect x="6" y="7" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2" />

      {/* Eyes */}
      <circle cx="12" cy="14" r="2" fill="currentColor" />
      <circle cx="20" cy="14" r="2" fill="currentColor" />

      {/* Mouth */}
      <line x1="12" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

      {/* Ears */}
      <rect x="2" y="11" width="3" height="6" rx="1" fill="currentColor" />
      <rect x="27" y="11" width="3" height="6" rx="1" fill="currentColor" />

      {/* Body */}
      <rect x="10" y="23" width="12" height="7" rx="2" stroke="currentColor" strokeWidth="2" />

      {/* Body connection */}
      <line x1="16" y1="21" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
