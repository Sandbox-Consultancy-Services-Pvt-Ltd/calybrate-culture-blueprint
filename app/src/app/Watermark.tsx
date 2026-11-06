
/** A faint, repeated "Calybrate Blueprint · Culture Management System" layer. It shows on printouts only (see print.css), never on screen. */
export function Watermark() {
  const text = 'Calybrate Blueprint · Culture Management System';
  const tile = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='460' height='240'><text x='20' y='130' transform='rotate(-24 230 120)' font-family='Inter,Arial,sans-serif' font-size='16' fill='#0b2a55' fill-opacity='0.08'>${text}</text></svg>`,
  );
  return <div className="wm" aria-hidden="true" data-testid="watermark" style={{ backgroundImage: `url("data:image/svg+xml,${tile}")` }} />;
}
