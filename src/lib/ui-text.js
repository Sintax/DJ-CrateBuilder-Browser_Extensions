/**
 * All user-facing copy for the three surfaces, in one place so they can't
 * drift apart. "Sent ✓" — never "Added" — because Phase 1 is one-way and
 * the extension only knows it dispatched the URI (SPEC §6).
 */

export function buttonLabelFor({ kind }) {
  if (kind === 'channel') return 'Add channel to Watch List';
  if (kind === 'track') return 'Download this track';
  return null;
}

export function menuTitleFor({ kind }) {
  if (kind === 'channel') return 'Send channel to DJ-CrateBuilder';
  if (kind === 'track') return 'Send track to DJ-CrateBuilder';
  return null;
}

/** Right-click choices for a track (design 2026-09-25). */
export const ACTION_TITLES = Object.freeze({ batch: 'Add to batch', download: 'Download now' });

export function sentLine(sentAt, now = Date.now()) {
  // A record with no usable timestamp (corrupt or hand-edited storage) still
  // says it was sent — just without the "… ago", never "NaN days ago".
  if (!Number.isFinite(sentAt)) return 'Sent ✓';
  const plural = (n, unit) => `Sent ✓ · ${n} ${unit}${n === 1 ? '' : 's'} ago`;
  const s = Math.max(0, Math.floor((now - sentAt) / 1000));
  if (s < 60) return 'Sent ✓ · just now';
  const m = Math.floor(s / 60);
  if (m < 60) return plural(m, 'minute');
  const h = Math.floor(m / 60);
  if (h < 24) return plural(h, 'hour');
  return plural(Math.floor(h / 24), 'day');
}
