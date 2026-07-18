type CustomliLogoProps = {
  compact?: boolean;
};

export function CustomliLogo({ compact = false }: CustomliLogoProps) {
  return (
    <div
      className={`customli-logo mission-logo ${compact ? "customli-logo-compact mission-logo-compact" : ""}`}
      aria-label="Mission Control"
    >
      <svg
        className="customli-mark mission-logo-mark"
        viewBox="0 0 128 128"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="mission-logo-gradient" x1="16" y1="112" x2="112" y2="16" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#b7adff" />
            <stop offset="0.52" stopColor="#8775ff" />
            <stop offset="1" stopColor="#6b5de8" />
          </linearGradient>
        </defs>
        <path
          fill="url(#mission-logo-gradient)"
          d="M32.7 99.8c-6.6 0-12.8-2.6-17.5-7.2C5.6 83 5.6 67.4 15.2 57.8l30.1-30.1c9.6-9.6 25.2-9.6 34.8 0l33.1 33.1c2.7 2.7 2.7 7.1 0 9.8s-7.1 2.7-9.8 0L70.3 37.5c-4.2-4.2-11-4.2-15.2 0L25 67.6c-4.2 4.2-4.2 11 0 15.2s11 4.2 15.2 0l17.2-17.2c2.7-2.7 7.1-2.7 9.8 0s2.7 7.1 0 9.8L50 92.6c-4.6 4.6-10.8 7.2-17.3 7.2Z"
        />
        <path
          fill="url(#mission-logo-gradient)"
          d="M80.2 104.8c-6.3 0-12.6-2.4-17.4-7.2L29.7 64.5c-2.7-2.7-2.7-7.1 0-9.8s7.1-2.7 9.8 0l33.1 33.1c4.2 4.2 11 4.2 15.2 0l15.2-15.2c4.2-4.2 4.2-11 0-15.2s-11-4.2-15.2 0L70.6 74.6c-2.7 2.7-7.1 2.7-9.8 0s-2.7-7.1 0-9.8L78 47.6c9.6-9.6 25.2-9.6 34.8 0s9.6 25.2 0 34.8L97.6 97.6c-4.8 4.8-11.1 7.2-17.4 7.2Z"
          opacity="0.92"
        />
      </svg>
      {!compact && <span className="sr-only">Mission Control</span>}
    </div>
  );
}
