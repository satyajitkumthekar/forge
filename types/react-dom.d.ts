// react-dom ships with Expo web but without @types/react-dom; declare the
// one API we use (full-screen overlays that must sit above the tab bar)
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}
