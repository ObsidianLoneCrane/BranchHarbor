mod credentials;
pub mod explorer;
mod models;
mod provider;
mod storage;
#[cfg(test)]
mod tests;

use credentials::{Credentials, SystemCredentials};
pub use models::*;
use provider::{Hosting, HttpHosting};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use zeroize::Zeroizing;

pub struct AccountService {
    path: PathBuf,
    credentials: Arc<dyn Credentials>,
    hosting: Arc<dyn Hosting>,
    operations: Mutex<()>,
}

impl AccountService {
    pub fn explore(&self, query: explorer::ExploreQuery) -> Result<explorer::ExploreResponse> {
        query.validate()?;
        let _guard = self.operations.lock().map_err(|_| AppError::storage())?;
        let connection = storage::open(&self.path)?;
        let account = storage::get(&connection, &query.account_id)?;
        let token = self
            .credentials
            .read(&account.id)?
            .filter(|token| !token.is_empty())
            .ok_or_else(AppError::missing)?;
        self.hosting.explore(&account, &token, &query)
    }
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            credentials: Arc::new(SystemCredentials),
            hosting: Arc::new(HttpHosting::new()),
            operations: Mutex::new(()),
        }
    }

    pub fn list(&self) -> Result<Vec<Account>> {
        let _guard = self.operations.lock().map_err(|_| AppError::storage())?;
        let connection = storage::open(&self.path)?;
        let mut accounts = storage::list(&connection)?;
        for account in &mut accounts {
            account.credential_status = match self.credentials.read(&account.id) {
                Ok(Some(token)) if !token.is_empty() => CredentialStatus::Saved,
                Ok(_) => CredentialStatus::Missing,
                Err(_) => CredentialStatus::Unavailable,
            };
        }
        Ok(accounts)
    }

    pub fn connect(
        &self,
        provider: Provider,
        token: Zeroizing<String>,
        expected_id: Option<String>,
    ) -> Result<Account> {
        let _guard = self.operations.lock().map_err(|_| AppError::storage())?;
        let token = token.trim();
        if token.is_empty() || token.len() > 4096 || token.chars().any(char::is_whitespace) {
            return Err(AppError::new(
                "invalidInput",
                "Enter a valid personal access token without whitespace.",
            ));
        }
        let account = self.hosting.identity(provider, token)?;
        if expected_id.as_ref().is_some_and(|id| id != &account.id) {
            return Err(AppError::new(
                "accountMismatch",
                "This token belongs to a different account. Add it as a separate connection.",
            ));
        }
        let mut connection = storage::open(&self.path)?;
        if let Some(id) = &expected_id {
            storage::get(&connection, id)?;
        }
        let old_token = self.credentials.read(&account.id)?;
        let transaction = connection.transaction().map_err(|_| AppError::storage())?;
        storage::save(&transaction, &account)?;
        self.credentials.write(&account.id, token)?;
        if transaction.commit().is_err() {
            self.restore(&account.id, old_token.as_deref().map(|s| s.as_str()))?;
            return Err(AppError::storage());
        }
        Ok(account)
    }

    pub fn disconnect(&self, id: &str) -> Result<()> {
        let _guard = self.operations.lock().map_err(|_| AppError::storage())?;
        let mut connection = storage::open(&self.path)?;
        storage::get(&connection, id)?;
        let old_token = self.credentials.read(id)?;
        let transaction = connection.transaction().map_err(|_| AppError::storage())?;
        transaction
            .execute("DELETE FROM accounts WHERE id=?1", [id])
            .map_err(|_| AppError::storage())?;
        self.credentials.delete(id)?;
        if transaction.commit().is_err() {
            self.restore(id, old_token.as_deref().map(|s| s.as_str()))?;
            return Err(AppError::storage());
        }
        Ok(())
    }

    fn restore(&self, id: &str, old: Option<&str>) -> Result<()> {
        let result = match old {
            Some(token) => self.credentials.write(id, token),
            None => self.credentials.delete(id),
        };
        result.map_err(|_| AppError::new("credentialUnavailable", "Account saving failed and credential rollback was incomplete. Reconnect this account to repair its stored credential."))
    }

    pub fn repositories(&self, query: RepositoryQuery) -> Result<RepositoryPage> {
        if query.page == 0 || query.page > 10000 {
            return Err(AppError::new(
                "invalidInput",
                "The repository page is out of range.",
            ));
        }
        let _guard = self.operations.lock().map_err(|_| AppError::storage())?;
        let connection = storage::open(&self.path)?;
        let account = storage::get(&connection, &query.account_id)?;
        let token = self
            .credentials
            .read(&account.id)?
            .filter(|token| !token.is_empty())
            .ok_or_else(AppError::missing)?;
        self.hosting.repositories(&account, &token, &query)
    }
}

#[tauri::command]
pub async fn list_accounts(service: tauri::State<'_, Arc<AccountService>>) -> Result<Vec<Account>> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.list())
        .await
        .map_err(|_| AppError::storage())?
}

#[tauri::command]
pub async fn connect_account(
    service: tauri::State<'_, Arc<AccountService>>,
    provider: Provider,
    token: String,
    expected_account_id: Option<String>,
) -> Result<Account> {
    let service = service.inner().clone();
    let token = Zeroizing::new(token);
    tauri::async_runtime::spawn_blocking(move || {
        service.connect(provider, token, expected_account_id)
    })
    .await
    .map_err(|_| AppError::storage())?
}

#[tauri::command]
pub async fn disconnect_account(
    service: tauri::State<'_, Arc<AccountService>>,
    account_id: String,
) -> Result<()> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.disconnect(&account_id))
        .await
        .map_err(|_| AppError::storage())?
}

#[tauri::command]
pub async fn list_repositories(
    service: tauri::State<'_, Arc<AccountService>>,
    query: RepositoryQuery,
) -> Result<RepositoryPage> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.repositories(query))
        .await
        .map_err(|_| AppError::storage())?
}

#[tauri::command]
pub async fn explore_repository(
    service: tauri::State<'_, Arc<AccountService>>,
    query: explorer::ExploreQuery,
) -> Result<explorer::ExploreResponse> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.explore(query))
        .await
        .map_err(|_| AppError::storage())?
}
