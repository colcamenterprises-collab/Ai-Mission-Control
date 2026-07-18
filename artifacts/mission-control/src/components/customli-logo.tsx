type CustomliLogoProps = {
  compact?: boolean;
};

export function CustomliLogo({ compact = false }: CustomliLogoProps) {
  return (
    <div
      className={`customli-logo mission-logo ${compact ? "customli-logo-compact mission-logo-compact" : ""}`}
      aria-label="Customli Mission Control"
    >
      <img
        className="customli-mark mission-logo-mark"
        src="/customli-logo-transparent.png"
        alt="Customli"
        draggable={false}
      />
      {!compact && <span className="sr-only">Customli Mission Control</span>}
    </div>
  );
}
