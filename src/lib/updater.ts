import { invoke, isTauri } from '@tauri-apps/api/core';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

/**
 * Check GitHub Releases for a newer version and offer to install it.
 *
 * Automatic checks (manual = false, run on launch) stay silent when the app
 * is up to date or the check fails; manual checks always report the outcome.
 */
export async function checkForUpdates(manual = false): Promise<void> {
  if (!isTauri() || !(await invoke<boolean>('supports_updater').catch(() => false))) return;
  try {
    const update = await check();
    if (!update) {
      if (manual) {
        await message('You’re running the latest version of TenLing.', {
          title: 'No update available',
          kind: 'info',
        });
      }
      return;
    }

    const install = await ask(
      `TenLing ${update.version} is available (you have ${update.currentVersion}).\n\nDownload and install it now? The app will restart to finish updating.`,
      { title: 'Update available', kind: 'info', okLabel: 'Update', cancelLabel: 'Later' },
    );
    if (!install) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    if (manual) {
      await message(`Could not check for updates.\n\n${String(error)}`, {
        title: 'Update check failed',
        kind: 'error',
      });
    }
  }
}
