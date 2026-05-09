export type HapticStrength = 'light' | 'medium' | 'heavy';

function patternFor(strength: HapticStrength): number | number[] {
  switch (strength) {
    case 'heavy':
      return [18];
    case 'medium':
      return [14];
    case 'light':
    default:
      return [10];
  }
}

export function hapticTap(strength: HapticStrength = 'light'): void {
  try {
    if (typeof navigator === 'undefined') return;
    if (typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(patternFor(strength));
  } catch {
    // ignore
  }
}

