import { isTauri } from '@tauri-apps/api/core';

export const isIOS =
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
export const isMobile = isIOS || navigator.userAgent.includes('Android');
export const isMac = !isMobile && navigator.userAgent.includes('Mac');

/** Gates the Linux-only direct PDF export (WebKitGTK print-to-file). */
export const isLinux = !isMobile && navigator.userAgent.includes('Linux');

/**
 * On Linux/Windows the Rust side removes native window decorations (see
 * src-tauri/src/lib.rs) and the frontend draws its own menu bar + window
 * controls instead (see src/components/MenuBar.tsx). macOS keeps the
 * native traffic lights and the native menu bar.
 */
export const customChrome =
  !isMobile &&
  isTauri() &&
  (navigator.userAgent.includes('Linux') || navigator.userAgent.includes('Windows'));
