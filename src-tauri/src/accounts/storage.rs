use super::models::{Account, AppError, CredentialStatus, Provider, Result};
use rusqlite::{Connection, OptionalExtension, Row};
use std::{path::Path, time::Duration};

pub fn open(path: &Path) -> Result<Connection> {
    std::fs::create_dir_all(path.parent().ok_or_else(AppError::storage)?)
        .map_err(|_| AppError::storage())?;
    let connection = Connection::open(path).map_err(|_| AppError::storage())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|_| AppError::storage())?;
    connection
        .pragma_update(None, "foreign_keys", true)
        .map_err(|_| AppError::storage())?;
    let version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| AppError::storage())?;
    if version > 1 {
        return Err(AppError::new(
            "storage",
            "This account database requires a newer application version.",
        ));
    }
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL CHECK(provider IN ('github','gitee')),
        host TEXT NOT NULL, user_id TEXT NOT NULL, login TEXT NOT NULL,
        name TEXT, verified_at INTEGER NOT NULL
    ); PRAGMA user_version = 1;",
        )
        .map_err(|_| AppError::storage())?;
    Ok(connection)
}

fn read_row(row: &Row<'_>) -> rusqlite::Result<Account> {
    let provider: String = row.get(1)?;
    let provider = match provider.as_str() {
        "github" => Provider::Github,
        "gitee" => Provider::Gitee,
        _ => return Err(rusqlite::Error::InvalidQuery),
    };
    Ok(Account {
        id: row.get(0)?,
        provider,
        host: row.get(2)?,
        user_id: row.get(3)?,
        login: row.get(4)?,
        name: row.get(5)?,
        verified_at: u64::try_from(row.get::<_, i64>(6)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?,
        credential_status: CredentialStatus::Missing,
    })
}

pub fn list(connection: &Connection) -> Result<Vec<Account>> {
    let mut statement = connection.prepare("SELECT id,provider,host,user_id,login,name,verified_at FROM accounts ORDER BY provider,login,id").map_err(|_| AppError::storage())?;
    let rows = statement
        .query_map([], read_row)
        .map_err(|_| AppError::storage())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|_| AppError::storage());
    rows
}

pub fn get(connection: &Connection, id: &str) -> Result<Account> {
    connection
        .query_row(
            "SELECT id,provider,host,user_id,login,name,verified_at FROM accounts WHERE id=?1",
            [id],
            read_row,
        )
        .optional()
        .map_err(|_| AppError::storage())?
        .ok_or_else(AppError::not_found)
}

pub fn save(connection: &Connection, account: &Account) -> Result<()> {
    let verified_at = i64::try_from(account.verified_at).map_err(|_| AppError::storage())?;
    connection.execute("INSERT INTO accounts(id,provider,host,user_id,login,name,verified_at) VALUES(?1,?2,?3,?4,?5,?6,?7)
        ON CONFLICT(id) DO UPDATE SET login=excluded.login,name=excluded.name,verified_at=excluded.verified_at",
        rusqlite::params![account.id,account.provider.slug(),account.host,account.user_id,account.login,account.name,verified_at])
        .map_err(|_| AppError::storage())?;
    Ok(())
}
