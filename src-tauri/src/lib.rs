#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    version: &'static str,
    platform: &'static str,
    architecture: &'static str,
}

#[tauri::command]
fn get_runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
    }
}

#[tauri::command]
async fn pick_repository_folder(
    window: tauri::WebviewWindow,
    title: String,
) -> Result<Option<String>, &'static str> {
    let dialog = window.dialog().file().set_parent(&window).set_title(title);
    tauri::async_runtime::spawn_blocking(move || {
        dialog
            .blocking_pick_folder()
            .map(|selected| {
                selected
                    .into_path()
                    .map_err(|_| "folderPicker")?
                    .into_os_string()
                    .into_string()
                    .map_err(|_| "unsupportedText")
            })
            .transpose()
    })
    .await
    .map_err(|_| "folderPicker")?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            #[cfg(debug_assertions)]
            let root = std::env::var_os("BRANCHHARBOR_DEV_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| root.join("development"));
            let path = root.join("accounts.sqlite3");
            app.manage(Arc::new(accounts::AccountService::new(path)));
            app.manage(Arc::new(local_git::LocalGit::new(
                root.join("local-repositories.sqlite3"),
            )));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_info,
            accounts::read_recent_github_activity,
            open_discussion_page,
            accounts::list_accounts,
            accounts::connect_account,
            accounts::disconnect_account,
            accounts::list_repositories,
            accounts::explore_repository,
            accounts::read_collaboration,
            accounts::contributions::read_contribution_source,
            accounts::contributions::read_cached_contribution_source,
            local_git::list_local_repositories,
            local_git::list_repository_links,
            pick_repository_folder,
            local_git::add_local_repository,
            local_git::remove_local_repository,
            local_git::read_local_repository,
            local_git::read_local_diff,
            local_git::change_local_repository,
            local_git::activity::read_local_activity,
            local_git::activity::read_recent_local_activity,
            local_git::inspection::read_local_history,
            local_git::inspection::read_local_tree,
            local_git::inspection::read_local_blob,
            local_git::references::read_local_references,
            local_git::references::read_remote_references,
            local_git::references::delete_remote_reference
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start BranchHarbor");
}

#[tauri::command]
async fn open_discussion_page(url: String) -> Result<(), &'static str> {
    let url = reqwest::Url::parse(&url).map_err(|_| "browserOpenFailed")?;
    if url.scheme() != "https"
        || !matches!(url.host_str(), Some("github.com" | "gitee.com"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("browserOpenFailed");
    }
    tauri::async_runtime::spawn_blocking(move || {
        tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|_| "browserOpenFailed")
    })
    .await
    .map_err(|_| "browserOpenFailed")?
}
mod accounts;
mod local_git;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
