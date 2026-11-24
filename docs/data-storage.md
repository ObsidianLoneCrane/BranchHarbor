# Data and storage

Open **Settings > Data and storage** in the desktop app to see the active data directory, total
SQLite file size, and the size of downloaded activity payloads. Database size includes SQLite
sidecar files when present. The activity figure measures stored payloads in the active database.

The default location is the OS application data directory for
`io.github.obsidianlonecrane.branchharbor`. On Windows this is normally
`%LOCALAPPDATA%\io.github.obsidianlonecrane.branchharbor`. Debug builds default to the `development`
subdirectory, and the Windows development script sets `BRANCHHARBOR_DEV_DATA_DIR` to the ignored
project directory `.dev-data`.

## Change the database location

Choose **Change data folder** and select a separate, empty directory. For example, on Windows you
can create and select `D:\BranchHarborData`. Close and reopen BranchHarbor to apply the change.
**Cancel move** is available until restart. Use a folder accessible to your OS account that will be
available whenever BranchHarbor starts.

BranchHarbor takes an exclusive lock on its default data location before starting its desktop
services. At startup it copies the account and local registration databases, verifies SQLite
integrity, and updates the active location in `data-location.json` in the default data directory. A
failed copy leaves the previous location active and reports the failure in Settings. The original
databases are retained as backups. Check the active path and verify your registrations before
removing an old copy manually. If a relocated drive is unavailable, reconnect it before opening
BranchHarbor. Keep the default folder's location file when backing up a relocated installation.

The move covers account metadata, repository registrations, and downloaded contribution data.
Credentials remain in the OS credential store. Appearance, language, and recent repository visit
statistics stay in the WebView profile. Git working trees and their histories stay in their own
directories. SQLite metadata and caches rely on OS filesystem permissions, so choose a directory
accessible only to appropriate users.

## Clear cached data

Choose **Clear cached data**, then confirm **Clear cache**. BranchHarbor deletes downloaded
contribution payloads from the active database and compacts it. It also clears in-memory discussion,
remote repository, and Activity response caches. Account connections, repository registrations,
preferences, and working trees are preserved. Retained backup files keep the data they had at the
time of migration.
