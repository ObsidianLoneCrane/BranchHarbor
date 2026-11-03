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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_local_data_dir()?;
            #[cfg(debug_assertions)]
            let root = std::env::var_os("BRANCHHARBOR_DEV_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|| root.join("development"));
            let path = root.join("accounts.sqlite3");
            app.manage(Arc::new(accounts::AccountService::new(path)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_info,
            accounts::list_accounts,
            accounts::connect_account,
            accounts::disconnect_account,
            accounts::list_repositories,
            accounts::explore_repository,
            accounts::read_collaboration
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start BranchHarbor");
}
mod accounts;
use std::sync::Arc;
use tauri::Manager;
