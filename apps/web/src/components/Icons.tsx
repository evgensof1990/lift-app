type P = { size?: number };

const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconHome = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></svg>
);
export const IconFlag = ({ size }: P) => (
  <svg {...base(size)}><path d="M5 21V4h11l-2 4 2 4H5" /></svg>
);
export const IconTasks = ({ size }: P) => (
  <svg {...base(size)}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
);
export const IconGrid = ({ size }: P) => (
  <svg {...base(size)}>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </svg>
);
export const IconForm = ({ size }: P) => (
  <svg {...base(size)}><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
);
export const IconBack = ({ size }: P) => (
  <svg {...base(size)} strokeWidth={2.4}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconCheck = ({ size }: P) => (
  <svg {...base(size)} strokeWidth={3}><path d="M5 12l5 5 9-10" /></svg>
);
export const IconGlobe = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>
);
export const IconBot = ({ size }: P) => (
  <svg {...base(size)}><rect x="4" y="7" width="16" height="12" rx="4" /><path d="M12 7V4M9 13h.01M15 13h.01" /></svg>
);
export const IconSend = ({ size }: P) => (
  <svg {...base(size)}><path d="M21 4L3 11l6 2 2 6 3-4 5 4z" /></svg>
);
export const IconCalendar = ({ size }: P) => (
  <svg {...base(size)}><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M9 3v4M15 3v4M8 14h3" /></svg>
);
export const IconPaperclip = ({ size }: P) => (
  <svg {...base(size)}><path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.8a1.7 1.7 0 0 1-2.4-2.4l7-7" /></svg>
);
export const IconLogout = ({ size }: P) => (
  <svg {...base(size)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></svg>
);

export function toolIcon(kind: string) {
  if (kind === "site") return <IconGlobe />;
  if (kind === "bot_max" || kind === "bot") return <IconBot />;
  if (kind === "bot_tg") return <IconSend />;
  if (kind === "smm") return <IconCalendar />;
  return <IconGrid />;
}
