/** Логотип «Лифт»: двери лифта и стрелка вверх */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="#7C3AED" />
      <path d="M24 8.5l7.5 8.5h-15z" fill="#fff" />
      <rect x="13" y="21" width="9.5" height="18" rx="2.5" fill="#fff" />
      <rect x="25.5" y="21" width="9.5" height="18" rx="2.5" fill="#C4B5FD" />
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo__word">Лифт</span>
    </span>
  );
}
