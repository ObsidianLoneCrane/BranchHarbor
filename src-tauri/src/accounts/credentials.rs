use super::models::{AppError, Result};
use zeroize::Zeroizing;

#[cfg(not(debug_assertions))]
const SERVICE: &str = "io.github.obsidianlonecrane.branchharbor.accounts";
#[cfg(debug_assertions)]
const SERVICE: &str = "io.github.obsidianlonecrane.branchharbor.development.accounts";

pub trait Credentials: Send + Sync {
    fn read(&self, id: &str) -> Result<Option<Zeroizing<String>>>;
    fn write(&self, id: &str, token: &str) -> Result<()>;
    fn delete(&self, id: &str) -> Result<()>;
}

pub struct SystemCredentials;

impl Credentials for SystemCredentials {
    fn read(&self, id: &str) -> Result<Option<Zeroizing<String>>> {
        let entry = keyring::Entry::new(SERVICE, id).map_err(|_| AppError::credential())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(Zeroizing::new(value))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(AppError::credential()),
        }
    }
    fn write(&self, id: &str, token: &str) -> Result<()> {
        keyring::Entry::new(SERVICE, id)
            .and_then(|entry| entry.set_password(token))
            .map_err(|_| AppError::credential())
    }
    fn delete(&self, id: &str) -> Result<()> {
        let entry = keyring::Entry::new(SERVICE, id).map_err(|_| AppError::credential())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(AppError::credential()),
        }
    }
}

#[cfg(test)]
#[test]
#[ignore = "Manual opt-in test; writes and removes one synthetic OS credential."]
fn native_credential_round_trip() {
    let id = format!(
        "test-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    let store = SystemCredentials;
    store
        .write(&id, "branchharbor-synthetic-credential")
        .unwrap();
    let read = store.read(&id);
    let deleted = store.delete(&id);
    assert_eq!(
        read.unwrap().unwrap().as_str(),
        "branchharbor-synthetic-credential"
    );
    deleted.unwrap();
    assert!(store.read(&id).unwrap().is_none());
}
