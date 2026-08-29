export function OrbisMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`orbis-mark ${inverse ? 'orbis-mark--inverse' : ''}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
