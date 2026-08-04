// The Uyirly brand mark — the same teal "U" used for the favicon, app icons and
// LinkedIn. Plain SVG (no hooks), so it renders in both server and client
// components. Sized in px to fit any logo slot.
export default function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 192 192"
      className={className}
      role="img"
      aria-label="Uyirly"
    >
      <rect width="192" height="192" rx="44" fill="#0D9488" />
      <path
        d="M64 56 V100 a32 32 0 0 0 64 0 V56"
        fill="none"
        stroke="#ffffff"
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
