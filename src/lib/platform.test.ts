import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
afterEach(() => vi.unstubAllGlobals());

describe('platform-specific desktop controls', () => {
  it.each([
    ['iPhone', 5, true, false, false],
    ['Macintosh', 5, true, false, false],
    ['Linux; Android 16', 5, true, false, false],
    ['Macintosh', 0, false, true, false],
    ['Linux x86_64', 0, false, false, true],
    ['Windows NT 10.0', 0, false, false, true],
  ])('%s with %i touch points', async (userAgent, maxTouchPoints, mobile, mac, chrome) => {
    vi.resetModules();
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints });
    const platform = await import('./platform');
    expect(platform.isMobile).toBe(mobile);
    expect(platform.isMac).toBe(mac);
    expect(platform.customChrome).toBe(chrome);
    if (mobile) expect(platform.isLinux).toBe(false);
  });
});
