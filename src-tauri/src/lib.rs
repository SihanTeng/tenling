#[cfg(any(target_os = "ios", all(target_os = "macos", feature = "app-store")))]
mod apple_access;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
#[cfg(desktop)]
use tauri::Emitter;
use tauri::Manager;

const RECENT_MAX: usize = 12;
const RECENT_FILE: &str = "recent.json";
const SESSION_FILE: &str = "session.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub name: String,
}

fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

fn recent_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = config_dir(app)?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join(RECENT_FILE))
}

fn file_name_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String, create_new: Option<bool>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
        }
    }
    // create_new: fail rather than overwrite an existing file (used by the
    // file browser's "New File", where clobbering would be silent data loss)
    if create_new.unwrap_or(false) {
        return fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .and_then(|mut f| f.write_all(contents.as_bytes()))
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    format!("File already exists: {}", file_name_from_path(&path))
                } else {
                    format!("Failed to write file: {e}")
                }
            });
    }
    // Write via temp + rename when possible for safer saves
    let tmp = format!("{path}.tmp");
    if let Err(error) = fs::write(&tmp, contents.as_bytes()) {
        // Apple's document picker can grant write access to one file without
        // granting permission to create a sibling temporary file.
        if error.kind() == std::io::ErrorKind::PermissionDenied {
            return fs::write(&path, contents.as_bytes())
                .map_err(|e| format!("Failed to save file: {e}"));
        }
        return Err(format!("Failed to write file: {error}"));
    }
    match fs::rename(&tmp, &path) {
        Ok(()) => Ok(()),
        Err(_) => {
            let _ = fs::remove_file(&tmp);
            fs::write(&path, contents.as_bytes()).map_err(|e| format!("Failed to save file: {e}"))
        }
    }
}

#[tauri::command]
fn list_recent(app: tauri::AppHandle) -> Result<Vec<RecentFile>, String> {
    let path = recent_path(&app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let list: Vec<RecentFile> = serde_json::from_str(&raw).unwrap_or_default();
    Ok(list)
}

#[tauri::command]
fn push_recent(app: tauri::AppHandle, path: String) -> Result<Vec<RecentFile>, String> {
    let mut list = list_recent(app.clone())?;
    list.retain(|f| f.path != path);
    list.insert(
        0,
        RecentFile {
            name: file_name_from_path(&path),
            path: path.clone(),
        },
    );
    list.truncate(RECENT_MAX);
    let dest = recent_path(&app)?;
    let raw = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(dest, raw).map_err(|e| e.to_string())?;
    Ok(list)
}

#[tauri::command]
fn clear_recent(app: tauri::AppHandle) -> Result<(), String> {
    let dest = recent_path(&app)?;
    if dest.exists() {
        fs::write(dest, "[]").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn remove_recent(app: tauri::AppHandle, path: String) -> Result<Vec<RecentFile>, String> {
    let mut list = list_recent(app.clone())?;
    list.retain(|f| f.path != path);
    let dest = recent_path(&app)?;
    let raw = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(dest, raw).map_err(|e| e.to_string())?;
    Ok(list)
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() {
        return Err(format!(
            "A file named {} already exists",
            file_name_from_path(&new_path)
        ));
    }
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename file: {e}"))
}

/// Duplicate a file next to the original: `note.md` -> `note copy.md`,
/// then `note copy 2.md`, and so on. Returns the new file's path.
#[tauri::command]
fn copy_file(path: String) -> Result<String, String> {
    let src = Path::new(&path);
    if !src.is_file() {
        return Err(format!("Not a file: {}", file_name_from_path(&path)));
    }
    let parent = src.parent().ok_or("File has no parent directory")?;
    let name = src
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("Invalid file name")?;
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    for i in 1..1000 {
        let candidate = parent.join(if i == 1 {
            format!("{stem} copy{ext}")
        } else {
            format!("{stem} copy {i}{ext}")
        });
        if !candidate.exists() {
            fs::copy(src, &candidate).map_err(|e| format!("Failed to copy file: {e}"))?;
            return Ok(candidate.to_string_lossy().into_owned());
        }
    }
    Err("Could not find a free copy name".into())
}

/// Move a file or directory to the OS trash.
#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        trash::delete(&path).map_err(|e| format!("Failed to move to trash: {e}"))
    }
    #[cfg(mobile)]
    {
        let _ = path;
        Err("Use the Files app to move documents to Recently Deleted.".into())
    }
}

/// Pasted/uploaded images live in an `assets/` folder next to the document;
/// the markdown references them by relative path so the folder stays portable.
/// Returns a collision-free destination like `assets/pic-1.png`.
fn unique_asset_path(assets_dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    if !assets_dir.exists() {
        fs::create_dir_all(assets_dir).map_err(|e| format!("Failed to create assets dir: {e}"))?;
    }
    let name = Path::new(file_name)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("image.png");
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    let mut dest = assets_dir.join(format!("{stem}{ext}"));
    let mut n = 1;
    while dest.exists() {
        dest = assets_dir.join(format!("{stem}-{n}{ext}"));
        n += 1;
    }
    Ok(dest)
}

fn relative_asset_path(dest: &Path) -> String {
    format!("assets/{}", file_name_from_path(&dest.to_string_lossy()))
}

/// Store pasted image bytes next to the document; returns the relative path.
#[tauri::command]
fn save_image_asset(doc_dir: String, name: String, data_base64: String) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| format!("Invalid image data: {e}"))?;
    let dest = unique_asset_path(Path::new(&doc_dir).join("assets").as_path(), &name)?;
    fs::write(&dest, bytes).map_err(|e| format!("Failed to write image: {e}"))?;
    Ok(relative_asset_path(&dest))
}

/// Copy an existing image file next to the document; returns the relative path.
#[tauri::command]
fn import_image(src_path: String, doc_dir: String) -> Result<String, String> {
    let src = Path::new(&src_path);
    if !src.is_file() {
        return Err(format!("Not a file: {src_path}"));
    }
    let dest = unique_asset_path(
        Path::new(&doc_dir).join("assets").as_path(),
        &file_name_from_path(&src_path),
    )?;
    fs::copy(src, &dest).map_err(|e| format!("Failed to copy image: {e}"))?;
    Ok(relative_asset_path(&dest))
}

/// Read a file as base64 — used to embed images into unsaved documents.
#[tauri::command]
fn read_binary_file(path: String) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Write base64-decoded bytes to a file — binary exports (e.g. DOCX).
#[tauri::command]
fn write_binary_file(path: String, data_base64: String) -> Result<(), String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|e| format!("Failed to decode data: {e}"))?;
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
        }
    }
    fs::write(&path, bytes).map_err(|e| format!("Failed to write file: {e}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub dir: String,
    pub parent: Option<String>,
    pub entries: Vec<DirEntry>,
}

/// Sidebar browser shows folders (navigation) plus files md can open.
fn is_browsable_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("md" | "markdown" | "mdown" | "txt")
    )
}

#[tauri::command]
fn list_dir(app: tauri::AppHandle, path: Option<String>) -> Result<DirListing, String> {
    let dir = match path {
        Some(p) => PathBuf::from(p),
        None => app.path().home_dir().map_err(|e| e.to_string())?,
    };
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", dir.display()));
    }

    let mut dirs: Vec<DirEntry> = vec![];
    let mut files: Vec<DirEntry> = vec![];
    let read = fs::read_dir(&dir).map_err(|e| format!("Failed to read directory: {e}"))?;
    for entry in read.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if name.starts_with('.') {
            continue; // skip hidden entries
        }
        let p = entry.path();
        let is_dir = p.is_dir();
        if !is_dir && !is_browsable_file(&p) {
            continue;
        }
        let item = DirEntry {
            name: name.to_string(),
            path: p.to_string_lossy().into_owned(),
            is_dir,
        };
        if is_dir {
            dirs.push(item);
        } else {
            files.push(item);
        }
    }
    let by_name = |a: &DirEntry, b: &DirEntry| a.name.to_lowercase().cmp(&b.name.to_lowercase());
    dirs.sort_by(by_name);
    files.sort_by(by_name);
    dirs.extend(files);

    Ok(DirListing {
        dir: dir.to_string_lossy().into_owned(),
        parent: dir.parent().map(|p| p.to_string_lossy().into_owned()),
        entries: dirs,
    })
}

/// Last-opened file / workspace folder, restored on next launch.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub file_path: Option<String>,
    pub workspace: Option<String>,
}

fn session_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = config_dir(app)?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir.join(SESSION_FILE))
}

#[tauri::command]
fn load_session(app: tauri::AppHandle) -> Result<Session, String> {
    let path = session_path(&app)?;
    if !path.exists() {
        return Ok(Session::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

#[tauri::command]
fn save_session(app: tauri::AppHandle, session: Session) -> Result<(), String> {
    let dest = session_path(&app)?;
    let raw = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    fs::write(dest, raw).map_err(|e| e.to_string())
}

/// File modification time (ms since epoch) — the frontend polls this on
/// window focus to detect external edits.
#[tauri::command]
fn file_mtime(path: String) -> Result<u64, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("Failed to stat file: {e}"))?;
    let mtime = meta.modified().map_err(|e| e.to_string())?;
    Ok(mtime
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64)
}

/// System print dialog — the PDF export path on macOS/Windows ("Save as
/// PDF" / "Microsoft Print to PDF"). Linux exports directly, see export_pdf.
#[tauri::command]
fn print_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let win = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;
        win.print().map_err(|e| e.to_string())
    }
    #[cfg(mobile)]
    {
        let _ = app;
        Err("Export as HTML or Word from the document menu on mobile.".into())
    }
}

// GtkPrinter is unbound in gtk-sys 0.18, so the four symbols the PDF export
// needs are declared here (opaque pointers; libgtk-3 is already linked).
#[cfg(target_os = "linux")]
type GtkPrinterPtr = *mut std::os::raw::c_void;

#[cfg(target_os = "linux")]
unsafe extern "C" {
    fn gtk_enumerate_printers(
        func: Option<unsafe extern "C" fn(GtkPrinterPtr, *mut std::os::raw::c_void) -> i32>,
        data: *mut std::os::raw::c_void,
        destroy: Option<unsafe extern "C" fn(*mut std::os::raw::c_void)>,
        wait: i32,
    );
    fn gtk_printer_is_virtual(printer: GtkPrinterPtr) -> i32;
    fn gtk_printer_accepts_pdf(printer: GtkPrinterPtr) -> i32;
    fn gtk_printer_get_name(printer: GtkPrinterPtr) -> *const std::os::raw::c_char;
}

/// The GTK file backend's printer ("Print to File"), looked up by capability
/// because its name is localized — hardcoding the English name breaks other
/// locales. The built-in file backend reports synchronously even with
/// wait=0, so this returns immediately; call it on the GTK main thread.
#[cfg(target_os = "linux")]
fn file_printer_name() -> Option<String> {
    use std::ffi::CStr;
    use std::os::raw::c_void;
    unsafe extern "C" fn visit(printer: GtkPrinterPtr, data: *mut c_void) -> i32 {
        let out = &mut *(data as *mut Option<String>);
        if gtk_printer_is_virtual(printer) != 0 && gtk_printer_accepts_pdf(printer) != 0 {
            let name = gtk_printer_get_name(printer);
            if !name.is_null() {
                *out = Some(CStr::from_ptr(name).to_string_lossy().into_owned());
                return 1; // stop enumeration
            }
        }
        0
    }
    let mut found = None;
    unsafe {
        gtk_enumerate_printers(Some(visit), &mut found as *mut _ as *mut c_void, None, 0);
    }
    found
}

/// Direct PDF export (Linux only): drive the WebKitGTK print operation at
/// the file backend, which renders the print stylesheet straight to the
/// output URI — no print dialog. Async so the wait never blocks the GTK
/// main loop. Other platforms keep the system print dialog (print_window).
#[cfg(target_os = "linux")]
#[tauri::command]
async fn export_pdf(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let path_in_closure = path.clone();
    win.with_webview(move |webview| {
        use webkit2gtk::PrintOperationExt;
        let op = webkit2gtk::PrintOperation::new(&webview.inner());
        let settings = gtk::PrintSettings::new();
        // Selecting the file backend's printer is what makes the output URI
        // effective; without it WebKitGTK prints to the default CUPS queue
        // (a broken queue surfaced as "PDF export failed: Broken pipe").
        let printer = file_printer_name().unwrap_or_else(|| "Print to File".to_string());
        settings.set(gtk::PRINT_SETTINGS_PRINTER, Some(&printer));
        settings.set(gtk::PRINT_SETTINGS_OUTPUT_FILE_FORMAT, Some("pdf"));
        settings.set(
            gtk::PRINT_SETTINGS_OUTPUT_URI,
            Some(&format!("file://{path_in_closure}")),
        );
        op.set_print_settings(&settings);
        let tx_failed = tx.clone();
        op.connect_finished(move |_| {
            let _ = tx.send(Ok(()));
        });
        op.connect_failed(move |_, err| {
            let _ = tx_failed.send(Err(format!("PDF export failed: {err}")));
        });
        op.print();
        // print() is async; keep our reference until the operation is over
        // rather than rely on GTK holding it (one tiny GObject per export).
        std::mem::forget(op);
    })
    .map_err(|e| e.to_string())?;
    // The print operation runs on the GTK main loop; wait on a worker thread.
    let printed = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "PDF export did not complete".to_string())?;
    printed?;
    // `finished` alone doesn't prove output (a misrouted job can still
    // finish) — confirm the file actually landed.
    match fs::metadata(&path) {
        Ok(meta) if meta.len() > 0 => Ok(()),
        _ => Err("PDF export produced no file".to_string()),
    }
}

/// Destroy the main window after the frontend confirmed the close.
#[tauri::command]
fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Quit the app after the frontend confirmed the close (Cmd+Q path).
#[tauri::command]
fn force_quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg(target_os = "macos")]
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let new = MenuItem::with_id(app, "file_new", "New", true, Some("CmdOrCtrl+N"))?;
    let open = MenuItem::with_id(app, "file_open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let save = MenuItem::with_id(app, "file_save", "Save", true, Some("CmdOrCtrl+S"))?;
    let save_as = MenuItem::with_id(
        app,
        "file_save_as",
        "Save As…",
        true,
        Some("CmdOrCtrl+Shift+S"),
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let export_html =
        MenuItem::with_id(app, "file_export_html", "Export HTML…", true, None::<&str>)?;
    let export_docx =
        MenuItem::with_id(app, "file_export_docx", "Export Word…", true, None::<&str>)?;
    let export_pdf = MenuItem::with_id(app, "file_export_pdf", "Export PDF…", true, None::<&str>)?;
    #[cfg(not(feature = "app-store"))]
    let check_updates = MenuItem::with_id(
        app,
        "app_check_updates",
        "Check for Updates…",
        true,
        None::<&str>,
    )?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new,
            &open,
            &sep,
            &save,
            &save_as,
            &sep2,
            &export_html,
            &export_docx,
            &export_pdf,
            &sep3,
            #[cfg(not(feature = "app-store"))]
            &check_updates,
            &quit,
        ],
    )?;

    let present = MenuItem::with_id(
        app,
        "view_present",
        "Present",
        true,
        Some("CmdOrCtrl+Shift+P"),
    )?;
    let view_menu = Submenu::with_items(app, "View", true, &[&present])?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "edit_find", "Find…", true, Some("CmdOrCtrl+F"))?,
            &MenuItem::with_id(app, "edit_copy_html", "Copy as HTML", true, None::<&str>)?,
        ],
    )?;

    Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Work around the WebKitGTK DMA-BUF renderer crashing on some Wayland
    // drivers (Gdk "Error 71 (Protocol error)"). Must be set before the
    // webview is created.
    #[cfg(target_os = "linux")]
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());
    #[cfg(all(desktop, not(feature = "app-store")))]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    #[cfg(any(target_os = "ios", all(target_os = "macos", feature = "app-store")))]
    let builder = builder.manage(apple_access::DocumentAccess::default());
    builder
        .invoke_handler(tauri::generate_handler![
            supports_updater,
            retain_document_access,
            read_text_file,
            write_text_file,
            write_binary_file,
            list_recent,
            push_recent,
            clear_recent,
            remove_recent,
            rename_file,
            copy_file,
            delete_path,
            save_image_asset,
            import_image,
            read_binary_file,
            list_dir,
            load_session,
            save_session,
            file_mtime,
            print_window,
            #[cfg(target_os = "linux")]
            export_pdf,
            close_window,
            force_quit
        ])
        .setup(|app| {
            #[cfg(any(target_os = "ios", all(target_os = "macos", feature = "app-store")))]
            if let Err(error) = apple_access::restore(app.handle()) {
                eprintln!("Could not restore document bookmarks: {error}");
            }
            // The native menu bar is macOS-only: on Linux/Windows the
            // frontend draws its own in-window menu (MenuBar.tsx), since
            // decorations are removed there.
            #[cfg(target_os = "macos")]
            {
                let menu = build_menu(app.handle())?;
                app.set_menu(menu)?;

                let handle = app.handle().clone();
                app.on_menu_event(move |_app, event| {
                    let id = event.id().as_ref();
                    let _ = handle.emit("menu", id);
                });
            }

            // Unsaved-changes guard: never let the OS close the window
            // directly — ask the frontend, which destroys the window (or
            // quits) once the user confirms.
            #[cfg(desktop)]
            if let Some(window) = app.get_webview_window("main") {
                // Custom chrome: the frontend renders the menu bar and the
                // window controls (min/max/close) itself.
                #[cfg(any(target_os = "linux", target_os = "windows"))]
                let _ = window.set_decorations(false);

                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.emit("close-requested", "window");
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_handle, _event| {
            // Same guard for Cmd+Q / Quit: hold the exit, let the frontend
            // confirm, then it calls force_quit. When the window is already
            // gone (macOS keeps the app running) just exit normally.
            #[cfg(desktop)]
            if let tauri::RunEvent::ExitRequested { api, .. } = _event {
                if _handle.get_webview_window("main").is_some() {
                    api.prevent_exit();
                    let _ = _handle.emit("close-requested", "quit");
                }
            }
        });
}

#[tauri::command]
fn supports_updater() -> bool {
    cfg!(all(desktop, not(feature = "app-store")))
}

#[tauri::command]
fn retain_document_access(_app: tauri::AppHandle, path: String) -> Result<String, String> {
    let path = if path.starts_with("file:") {
        tauri::Url::parse(&path)
            .map_err(|e| e.to_string())?
            .to_file_path()
            .map_err(|_| "Invalid local file URL")?
            .to_string_lossy()
            .into_owned()
    } else {
        path
    };
    #[cfg(any(target_os = "ios", all(target_os = "macos", feature = "app-store")))]
    apple_access::remember(&_app, &path)?;
    Ok(path)
}
