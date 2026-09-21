import type { WeaponProfile } from './types';
import { VANDAL } from './vandal';
import { PHANTOM } from './phantom';

export const PARAMS_VERSION = '2026.09.21-SNAPSHOT';

export const WEAPONS: Record<WeaponProfile['id'], WeaponProfile> = {
  vandal: VANDAL,
  phantom: PHANTOM,
};

export * from './types';
export { VANDAL, PHANTOM };
