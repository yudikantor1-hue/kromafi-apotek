interface IconProps {
  className?: string;
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export function IconPlus({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconSearch({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function IconSync({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 4v5h5" />
      <path d="M20 20v-5h-5" />
      <path d="M4.6 13a8 8 0 0 0 13.2 3.4L20 15" />
      <path d="M19.4 11A8 8 0 0 0 6.2 7.6L4 9" />
    </svg>
  );
}

export function IconClock({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function IconMenu({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function IconClose({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconBack({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M10 19l-7-7 7-7M3 12h18" />
    </svg>
  );
}

export function IconEye({ size = 18, off = false }: IconProps & { off?: boolean }) {
  return (
    <svg {...base(size)}>
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c4.5 0 8.3 2.9 9.5 7a10.4 10.4 0 0 1-2.2 3.5" />
          <path d="M6.6 6.6A10.4 10.4 0 0 0 2.5 13C3.7 17.1 7.5 20 12 20c1.7 0 3.3-.4 4.7-1.1" />
        </>
      ) : (
        <>
          <path d="M2.5 12C3.7 7.9 7.5 5 12 5s8.3 2.9 9.5 7c-1.2 4.1-5 7-9.5 7s-8.3-2.9-9.5-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export function IconBuilding({ size = 24 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M16 9h2a2 2 0 0 1 2 2v10M2 21h20" />
      <path d="M8 7h2M8 11h2M8 15h2M12 7h1M12 11h1M12 15h1" />
    </svg>
  );
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconDownload({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconEdit({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 20h4L18.5 9.5a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

/* ---------- Drawer navigation ---------- */

export function IconCart({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.4 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21 7H6" />
    </svg>
  );
}

export function IconInvoice({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 3h10l4 4v14H5z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconReceipt({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function IconBox({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 8l9-5 9 5v8l-9 5-9-5z" />
      <path d="M3 8l9 5 9-5M12 13v8" />
    </svg>
  );
}

export function IconService({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z" />
    </svg>
  );
}

export function IconHistory({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function IconBoxMinus({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20 12V8l-9-5-9 5v8l9 5 5-2.8" />
      <path d="M3 8l9 5 9-5M12 13v8" />
      <path d="M17 17h6" />
    </svg>
  );
}

export function IconClipboard({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M9 4H5v17h14V4h-4" />
      <path d="M9 2h6v4H9z" />
      <path d="m9 13 2.2 2.2L16 10.5" />
    </svg>
  );
}

export function IconExpired({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 5h18v16H3z" />
      <path d="M8 3v4M16 3v4M3 11h18" />
      <path d="M12 14v3M10.5 15.5h3" />
    </svg>
  );
}

export function IconTrending({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 17l5-6 4 4 6-8" />
      <path d="M15 7h4v4" />
    </svg>
  );
}

export function IconChart({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M4 20V13M9 20V8M14 20v-5M19 20V4" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function IconReport({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M10 12v5M13 9v8M16 14v3" />
    </svg>
  );
}

export function IconTruck({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 6h11v11H3z" />
      <path d="M14 10h4l3 3v4h-7z" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="17.5" cy="18" r="1.8" />
    </svg>
  );
}

export function IconStethoscope({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 3v5a4 4 0 0 0 8 0V3" />
      <path d="M5 3H3M13 3h2" />
      <path d="M9 12v3a4 4 0 0 0 8 0v-2" />
      <circle cx="17" cy="10.5" r="2" />
    </svg>
  );
}

export function IconCard({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19" />
    </svg>
  );
}

export function IconCabinet({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18" />
      <path d="M8 6v.01M8 12v.01M8 18v.01" />
    </svg>
  );
}

export function IconUsers({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  );
}
