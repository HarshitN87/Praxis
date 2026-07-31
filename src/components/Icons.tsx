/** Line icons, drawn to match the notebook aesthetic. No filled glyphs. */

type P = { size?: number };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const IconToday = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const IconTimeline = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

export const IconDecision = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3v6M12 9l-6 5M12 9l6 5" />
    <circle cx="12" cy="3" r="1.6" />
    <circle cx="6" cy="15" r="2" />
    <circle cx="18" cy="15" r="2" />
    <path d="M6 17v4M18 17v4" />
  </svg>
);

export const IconSystems = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="7" height="6" rx="1.5" />
    <rect x="14" y="14" width="7" height="6" rx="1.5" />
    <path d="M10 7h4a3.5 3.5 0 0 1 3.5 3.5V14" />
    <path d="M15.6 12.2 17.5 14l1.9-1.8" />
  </svg>
);

export const IconMetrics = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <path d="M4 20 20 4" strokeDasharray="2 3" opacity="0.5" />
    <path d="M4 20c4-2 5-6 8-8s5-4 8-8" />
    <circle cx="4" cy="20" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="20" cy="4" r="1.4" />
  </svg>
);

export const IconMore = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>
);

export const IconPlus = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconBack = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const IconSearch = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.3-4.3" />
  </svg>
);

export const IconCheck = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const IconCross = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconDash = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M6 12h12" />
  </svg>
);

export const IconWarn = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M12 4 3 19h18L12 4Z" />
    <path d="M12 10v4M12 16.5v.5" />
  </svg>
);

export const IconReframe = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <path d="M4 8a8 8 0 0 1 14-4M20 16a8 8 0 0 1-14 4" />
    <path d="M4 4v4h4M20 20v-4h-4" />
  </svg>
);

export const IconSketch = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M3 9h18" />
  </svg>
);

export const IconSettings = ({ size = 21 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </svg>
);
