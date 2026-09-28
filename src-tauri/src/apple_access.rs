//! Keep access to user-selected documents across launches in Apple's sandbox.
use objc2::rc::Retained;
use objc2_foundation::{
    NSData, NSString, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions, NSURL,
};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};
use tauri::Manager;

#[derive(Default)]
pub struct DocumentAccess(Mutex<HashMap<String, Retained<NSURL>>>);

fn bookmarks_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("document-bookmarks.json"))
}

fn creation_options() -> NSURLBookmarkCreationOptions {
    #[cfg(target_os = "macos")]
    {
        NSURLBookmarkCreationOptions::WithSecurityScope
    }
    #[cfg(target_os = "ios")]
    {
        NSURLBookmarkCreationOptions::MinimalBookmark
    }
}

fn resolution_options() -> NSURLBookmarkResolutionOptions {
    #[cfg(target_os = "macos")]
    {
        NSURLBookmarkResolutionOptions::WithSecurityScope
            | NSURLBookmarkResolutionOptions::WithoutUI
    }
    #[cfg(target_os = "ios")]
    {
        NSURLBookmarkResolutionOptions::WithoutUI
    }
}

pub fn remember(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let url = NSURL::fileURLWithPath(&NSString::from_str(path));
    let state = app.state::<DocumentAccess>();
    let mut active = state.0.lock().map_err(|e| e.to_string())?;
    if !active.contains_key(path) {
        // The matching retained URL stays alive for the app session. macOS
        // save/open panels may have already granted a process-level extension.
        if unsafe { url.startAccessingSecurityScopedResource() } {
            active.insert(path.to_string(), url.clone());
        }
    }
    // A new save destination may not exist until the document is written.
    if !std::path::Path::new(path).exists() {
        return Ok(());
    }
    let data = url
        .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(
            creation_options(),
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
    let destination = bookmarks_path(app)?;
    let mut bookmarks: HashMap<String, Vec<u8>> = fs::read(&destination)
        .ok()
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .unwrap_or_default();
    bookmarks.insert(path.to_string(), data.to_vec());
    let raw = serde_json::to_vec(&bookmarks).map_err(|e| e.to_string())?;
    let temporary = destination.with_extension("tmp");
    fs::write(&temporary, raw).map_err(|e| e.to_string())?;
    fs::rename(temporary, destination).map_err(|e| e.to_string())
}

pub fn restore(app: &tauri::AppHandle) -> Result<(), String> {
    let path = bookmarks_path(app)?;
    let Ok(raw) = fs::read(path) else {
        return Ok(());
    };
    let bookmarks: HashMap<String, Vec<u8>> =
        serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
    let state = app.state::<DocumentAccess>();
    let mut active = state.0.lock().map_err(|e| e.to_string())?;
    for (path, bytes) in bookmarks {
        let data = NSData::from_vec(bytes);
        // A stale or removed file is left for the normal open-error UI; never
        // replace a failed bookmark with broader filesystem permissions.
        if let Ok(url) = unsafe {
            NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                &data,
                resolution_options(),
                None,
                std::ptr::null_mut(),
            )
        } {
            if unsafe { url.startAccessingSecurityScopedResource() } {
                active.insert(path, url);
            }
        }
    }
    Ok(())
}

impl Drop for DocumentAccess {
    fn drop(&mut self) {
        if let Ok(active) = self.0.get_mut() {
            for url in active.values() {
                unsafe { url.stopAccessingSecurityScopedResource() };
            }
        }
    }
}
