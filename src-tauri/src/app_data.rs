use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::State;

const DATABASES: [&str; 2] = ["accounts.sqlite3", "local-repositories.sqlite3"];
const POINTER: &str = "data-location.json";

#[derive(Default, Deserialize, Serialize)]
struct Location {
    current: Option<PathBuf>,
    pending: Option<PathBuf>,
}

pub struct AppData {
    base: PathBuf,
    root: PathBuf,
    location: Mutex<Location>,
    migration_failed: bool,
    _instance: File,
}

impl AppData {
    pub fn open(base: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        fs::create_dir_all(&base)?;
        let instance = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(base.join("data.lock"))?;
        instance.try_lock()?;
        let mut location: Location = match fs::read(base.join(POINTER)) {
            Ok(bytes) => serde_json::from_slice(&bytes)?,
            Err(error) if error.kind() == io::ErrorKind::NotFound => Location::default(),
            Err(error) => return Err(error.into()),
        };
        let mut root = location.current.clone().unwrap_or_else(|| base.clone());
        if !root.is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "The selected data directory is unavailable.",
            )
            .into());
        }
        let mut migration_failed = false;
        if let Some(destination) = location.pending.take() {
            match migrate(&root, &destination, &base) {
                Ok(next) => {
                    root = next;
                    location.current = Some(root.clone());
                }
                Err(_) => {
                    migration_failed = true;
                    save(&base, &location)?;
                }
            }
        }
        Ok(Self {
            base,
            root,
            location: Mutex::new(location),
            migration_failed,
            _instance: instance,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

fn save(base: &Path, location: &Location) -> Result<(), Box<dyn std::error::Error>> {
    let temporary = base.join("data-location.tmp");
    let mut file = File::create(&temporary)?;
    serde_json::to_writer(&mut file, location)?;
    file.flush()?;
    file.sync_all()?;
    drop(file);
    fs::rename(temporary, base.join(POINTER))?;
    Ok(())
}

fn destination(path: &Path, source: &Path) -> io::Result<PathBuf> {
    if !path.is_absolute() {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    let path = path.canonicalize()?;
    let source = source.canonicalize()?;
    if path.starts_with(&source)
        || source.starts_with(&path)
        || fs::read_dir(&path)?.next().is_some()
    {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    if path.to_str().is_none() {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    Ok(path)
}

fn migrate(
    source: &Path,
    requested: &Path,
    base: &Path,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let destination = destination(requested, source)?;
    let mut created = Vec::new();
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        for name in DATABASES {
            let original = source.join(name);
            if !original.try_exists()? {
                continue;
            }
            let target = destination.join(name);
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)?;
            created.push(target.clone());
            let db = Connection::open_with_flags(original, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let target_path = target
                .to_str()
                .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
            db.execute("VACUUM INTO ?1", [target_path])?;
            let copy = Connection::open_with_flags(&target, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            let integrity: String =
                copy.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
            if integrity != "ok" {
                return Err(io::Error::other("Database integrity check failed").into());
            }
            drop(copy);
            OpenOptions::new().write(true).open(target)?.sync_all()?;
        }
        save(
            base,
            &Location {
                current: Some(destination.clone()),
                pending: None,
            },
        )?;
        Ok(())
    })();
    if let Err(error) = result {
        for file in created {
            let _ = fs::remove_file(file);
        }
        return Err(error);
    }
    Ok(destination)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StorageInfo {
    path: PathBuf,
    pending_path: Option<PathBuf>,
    database_bytes: u64,
    migration_failed: bool,
}

#[tauri::command]
pub(crate) fn get_storage_info(data: State<'_, AppData>) -> Result<StorageInfo, &'static str> {
    let location = data.location.lock().map_err(|_| "storage")?;
    let mut bytes = 0u64;
    for file in DATABASES {
        for suffix in ["", "-wal", "-shm", "-journal"] {
            match fs::metadata(data.root.join(format!("{file}{suffix}"))) {
                Ok(metadata) => bytes = bytes.saturating_add(metadata.len()),
                Err(error) if error.kind() == io::ErrorKind::NotFound => (),
                Err(_) => return Err("storage"),
            }
        }
    }
    Ok(StorageInfo {
        path: data.root.clone(),
        pending_path: location.pending.clone(),
        database_bytes: bytes,
        migration_failed: data.migration_failed,
    })
}

#[tauri::command]
pub(crate) fn schedule_data_move(
    data: State<'_, AppData>,
    folder: Option<PathBuf>,
) -> Result<(), &'static str> {
    let mut location = data.location.lock().map_err(|_| "storage")?;
    let pending = folder
        .map(|path| destination(&path, &data.root))
        .transpose()
        .map_err(|_| "invalidStorageFolder")?;
    let next = Location {
        current: location.current.clone(),
        pending,
    };
    save(&data.base, &next).map_err(|_| "storage")?;
    *location = next;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_database(path: &Path, value: &str) {
        let database = Connection::open(path).unwrap();
        database
            .execute_batch("PRAGMA user_version=2; CREATE TABLE example (value TEXT);")
            .unwrap();
        database
            .execute("INSERT INTO example VALUES (?1)", [value])
            .unwrap();
    }

    #[test]
    fn moves_databases_after_restart_and_keeps_the_originals() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("original");
        let target = directory.path().join("target");
        fs::create_dir(&target).unwrap();
        let app = AppData::open(source.clone()).unwrap();
        for name in DATABASES {
            create_database(&source.join(name), name);
        }
        assert!(AppData::open(source.clone()).is_err());
        save(
            &source,
            &Location {
                current: None,
                pending: Some(target.clone()),
            },
        )
        .unwrap();
        drop(app);

        let app = AppData::open(source.clone()).unwrap();
        assert_eq!(app.root(), target.canonicalize().unwrap());
        assert!(!app.migration_failed);
        for name in DATABASES {
            assert!(source.join(name).is_file());
            let database = Connection::open(app.root().join(name)).unwrap();
            let value: String = database
                .query_row("SELECT value FROM example", [], |row| row.get(0))
                .unwrap();
            let version: i64 = database
                .pragma_query_value(None, "user_version", |row| row.get(0))
                .unwrap();
            assert_eq!(value, name);
            assert_eq!(version, 2);
        }
        assert!(app.location.lock().unwrap().pending.is_none());
        drop(app);
        assert_eq!(
            AppData::open(source).unwrap().root(),
            target.canonicalize().unwrap()
        );
    }

    #[test]
    fn retains_the_current_directory_and_removes_partial_copies_on_failure() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("original");
        let target = directory.path().join("target");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&target).unwrap();
        create_database(&source.join(DATABASES[0]), "retain this");
        fs::write(source.join(DATABASES[1]), "invalid database").unwrap();
        save(
            &source,
            &Location {
                current: None,
                pending: Some(target.clone()),
            },
        )
        .unwrap();

        let app = AppData::open(source.clone()).unwrap();
        assert_eq!(app.root(), source);
        assert!(app.migration_failed);
        assert!(app.location.lock().unwrap().pending.is_none());
        assert!(fs::read_dir(&target).unwrap().next().is_none());
        assert!(source.join(DATABASES[0]).is_file());
        assert!(destination(&source, &source).is_err());
        fs::write(target.join("unrelated.txt"), "keep this").unwrap();
        assert!(destination(&target, &source).is_err());
    }
}
