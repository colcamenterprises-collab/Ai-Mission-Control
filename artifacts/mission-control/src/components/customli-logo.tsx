type CustomliLogoProps = {
  compact?: boolean;
};

export function CustomliLogo({ compact = false }: CustomliLogoProps) {
  return (
    <div className={`customli-logo ${compact ? "customli-logo-compact" : ""}`} aria-label="Customli">
      <svg className="customli-mark" viewBox="0 0 48 48" role="img" aria-hidden="true">
        <path d="M8 17.8 23.8 8l15.9 9.8-5.7 3.4-10.2-6.3-10.1 6.3L8 17.8Z" />
        <path d="M8 29.9 23.8 20l15.9 9.9-5.7 3.4-10.2-6.4-10.1 6.4L8 29.9Z" opacity="0.72" />
        <path d="M18.1 36.1 23.8 32l5.8 4.1-5.8 3.9-5.7-3.9Z" opacity="0.44" />
      </svg>
      {!compact && <span className="customli-wordmark">customli</span>}
    </div>
  );
}
