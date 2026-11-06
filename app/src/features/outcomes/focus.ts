/** Hand-off from the CCT Framework page: "open this area (and pillar) in CCT Outcomes". */
export interface FocusRequest {
  area: string;
  pillar: string | null;
}
let pending: FocusRequest | null = null;

export function requestOutcomesFocus(area: string, pillar: string | null) {
  pending = { area, pillar };
  if (location.hash !== '#outcomes') location.hash = '#outcomes';
}
/** Returns the pending request once, then clears it. */
export function takeOutcomesFocus(): FocusRequest | null {
  const p = pending;
  pending = null;
  return p;
}
