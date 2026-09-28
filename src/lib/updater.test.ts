import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  isTauri: vi.fn(),
  invoke: vi.fn(),
  check: vi.fn(),
  message: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: api.isTauri, invoke: api.invoke }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: api.check }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: api.message, ask: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));

import { checkForUpdates } from './updater';

beforeEach(() => {
  vi.resetAllMocks();
  api.isTauri.mockReturnValue(true);
  api.check.mockResolvedValue(null);
});
describe('App Store updater isolation', () => {
  it('never contacts the updater in App Store builds', async () => {
    api.invoke.mockResolvedValue(false);
    await checkForUpdates(true);
    expect(api.check).not.toHaveBeenCalled();
    expect(api.message).not.toHaveBeenCalled();
  });
  it('fails closed if the native capability cannot be read', async () => {
    api.invoke.mockRejectedValue(new Error('unavailable'));
    await checkForUpdates();
    expect(api.check).not.toHaveBeenCalled();
  });
  it('retains update checks in direct desktop builds', async () => {
    api.invoke.mockResolvedValue(true);
    await checkForUpdates(true);
    expect(api.check).toHaveBeenCalledOnce();
    expect(api.message).toHaveBeenCalledOnce();
  });
  it('does not use native plugins in browser previews', async () => {
    api.isTauri.mockReturnValue(false);
    await checkForUpdates();
    expect(api.invoke).not.toHaveBeenCalled();
    expect(api.check).not.toHaveBeenCalled();
  });
});
