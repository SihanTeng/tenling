import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { RecentFile } from '../../stores/documentStore';
import { isMobile } from '../platform';

async function retainPath(path: string | null): Promise<string | null> {
  return path ? invoke<string>('retain_document_access', { path }) : null;
}

const MD_FILTERS = [
  {
    name: 'Markdown',
    extensions: ['md', 'markdown', 'mdown', 'txt'],
  },
];

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
}

export async function writeTextFile(
  path: string,
  contents: string,
  opts?: { createNew?: boolean },
): Promise<void> {
  await invoke('write_text_file', { path, contents, createNew: opts?.createNew ?? false });
  await retainPath(path);
}

/** Write base64-encoded bytes — binary exports like DOCX. */
export async function writeBinaryFile(path: string, dataBase64: string): Promise<void> {
  await invoke('write_binary_file', { path, dataBase64 });
  await retainPath(path);
}

export async function listRecent(): Promise<RecentFile[]> {
  return invoke<RecentFile[]>('list_recent');
}

export async function pushRecent(path: string): Promise<RecentFile[]> {
  return invoke<RecentFile[]>('push_recent', { path });
}

export async function clearRecent(): Promise<void> {
  await invoke('clear_recent');
}

export async function removeRecent(path: string): Promise<RecentFile[]> {
  return invoke<RecentFile[]>('remove_recent', { path });
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  await invoke('rename_file', { oldPath, newPath });
}

/** Duplicate a file next to the original ("name copy.md"); returns the new path. */
export async function copyFile(path: string): Promise<string> {
  return invoke<string>('copy_file', { path });
}

/** Move a file or directory to the OS trash. */
export async function deletePath(path: string): Promise<void> {
  await invoke('delete_path', { path });
}

/** Store pasted image bytes next to the document; returns the relative path. */
export async function saveImageAsset(
  docDir: string,
  name: string,
  dataBase64: string,
): Promise<string> {
  return invoke<string>('save_image_asset', { docDir, name, dataBase64 });
}

/** Copy an existing image file next to the document; returns the relative path. */
export async function importImage(srcPath: string, docDir: string): Promise<string> {
  return invoke<string>('import_image', { srcPath, docDir });
}

/** Read a file as base64 — used to embed images into unsaved documents. */
export async function readBinaryFileBase64(path: string): Promise<string> {
  return invoke<string>('read_binary_file', { path });
}

export function dirNameFromPath(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx > 0 ? path.slice(0, idx) : '';
}

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface DirListing {
  dir: string;
  parent: string | null;
  entries: DirEntry[];
}

export async function listDir(path?: string): Promise<DirListing> {
  return invoke<DirListing>('list_dir', { path: path ?? null });
}

export interface Session {
  filePath: string | null;
  workspace: string | null;
}

export async function loadSession(): Promise<Session> {
  return invoke<Session>('load_session');
}

export async function saveSession(session: Session): Promise<void> {
  await invoke('save_session', { session });
}

/** File modification time in ms since epoch — for external-change detection. */
export async function fileMtime(path: string): Promise<number> {
  return invoke<number>('file_mtime', { path });
}

/** Open the system print dialog (users pick "Save as PDF" to export). */
export async function printWindow(): Promise<void> {
  await invoke('print_window');
}

/** Render the document straight to a PDF file, no dialog (Linux only). */
export async function exportPdfToFile(path: string): Promise<void> {
  await invoke('export_pdf', { path });
}

/** Destroy the main window after a confirmed close. */
export async function closeWindow(): Promise<void> {
  await invoke('close_window');
}

/** Quit the whole app after a confirmed close (Cmd+Q path). */
export async function forceQuit(): Promise<void> {
  await invoke('force_quit');
}

export async function pickOpenPath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: MD_FILTERS,
    fileAccessMode: 'scoped',
  });
  if (selected === null) return null;
  if (Array.isArray(selected)) return retainPath(selected[0] ?? null);
  return retainPath(selected);
}

export async function pickDirectory(): Promise<string | null> {
  if (isMobile) return null;
  const selected = await open({
    multiple: false,
    directory: true,
  });
  if (selected === null) return null;
  if (Array.isArray(selected)) return retainPath(selected[0] ?? null);
  return retainPath(selected);
}

const IMAGE_FILTERS = [
  {
    name: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'],
  },
];

export async function pickImagePath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: IMAGE_FILTERS,
  });
  if (selected === null) return null;
  if (Array.isArray(selected)) return retainPath(selected[0] ?? null);
  return retainPath(selected);
}

export async function pickSavePath(defaultPath?: string): Promise<string | null> {
  const path = await save({
    filters: MD_FILTERS,
    defaultPath: isMobile
      ? (defaultPath?.split(/[/\\]/).pop() ?? 'Untitled.md')
      : (defaultPath ?? 'Untitled.md'),
  });
  return retainPath(path);
}

const HTML_FILTERS = [{ name: 'HTML', extensions: ['html'] }];

/** Save-dialog for HTML export (`.html` extension, own filter). */
export async function pickExportHtmlPath(defaultPath: string): Promise<string | null> {
  return retainPath(await save({ filters: HTML_FILTERS, defaultPath }));
}

const DOCX_FILTERS = [{ name: 'Word', extensions: ['docx'] }];

/** Save-dialog for Word export (`.docx` extension, own filter). */
export async function pickExportDocxPath(defaultPath: string): Promise<string | null> {
  return retainPath(await save({ filters: DOCX_FILTERS, defaultPath }));
}

const PDF_FILTERS = [{ name: 'PDF', extensions: ['pdf'] }];

/** Save-dialog for PDF export (`.pdf` extension, own filter). */
export async function pickExportPdfPath(defaultPath: string): Promise<string | null> {
  return retainPath(await save({ filters: PDF_FILTERS, defaultPath }));
}
