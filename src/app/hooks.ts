import { useEffect, useReducer } from 'react';
import { transition, type PageState, type PageEvent } from './state';

export function usePageMachine(initial: PageState = 'loading') {
  const [state, dispatch] = useReducer(transition, initial);
  return {
    state,
    send: (e: PageEvent) => dispatch(e),
  };
}

/** Esc 失锁自动暂停（手册 §5.2 / 红线）：监听 pointerlockchange */
export function usePointerLockPause(onUnlock: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = () => {
      if (!document.pointerLockElement) onUnlock();
    };
    document.addEventListener('pointerlockchange', handler);
    return () => document.removeEventListener('pointerlockchange', handler);
  }, [active, onUnlock]);
}
