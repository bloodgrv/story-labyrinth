# Deployment Guide

## Development

### Prerequisites

- Node.js 20+
- npm

### Running Locally

```bash
# Install dependencies
npm install

# Run development server (concurrent backend + frontend)
npm run dev
```

Development servers:

- Backend API: http://localhost:3001
- Frontend: http://localhost:5173 (proxies /api to backend)

### Building

```bash
# Build both frontend and backend
npm run build
```

Built files:

- Frontend: `dist/client/`
- Backend: `dist/server/`

## Production (Docker)

### Using Docker Compose

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

Application will be available at: http://localhost:3000

### Using Docker Directly

```bash
# Build image
docker build -t story-labyrinth .

# Run container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --name story-labyrinth \
  story-labyrinth
```

### Data Persistence

SQLite database is stored in `./data/story-labyrinth.db` (mounted as volume).

To backup:

```bash
cp data/story-labyrinth.db data/story-labyrinth.db.backup
```

## Migration from Tauri App

1. Open the old Tauri app
2. Navigate to AI Settings
3. Click "Export Database" under Database Migration
4. Save the JSON file
5. Open the new web app at http://localhost:3000
6. Navigate to AI Settings
7. Click "Import Database" under Database Migration
8. Upload the JSON file
9. Confirm the import (WARNING: replaces all data)
10. Reload the page

## Environment Variables

- `PORT` - Server port (default: 3000 in prod, 3001 in dev)
- `NODE_ENV` - Environment (development/production)
- `DATABASE_PATH` - SQLite database file path (default: ./data/story-labyrinth.db)

## Accessing from Other Devices

1. Find your server's LAN IP address:

    ```bash
    # Linux/Mac
    hostname -I

    # Windows
    ipconfig
    ```

2. Access from other devices on the same network:
    ```
    http://YOUR-SERVER-IP:3000
    ```

Example: `http://192.168.1.100:3000`

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Database Locked

SQLite can lock if multiple processes access it. Ensure only one instance is running.

### Migration Failed

- Check browser console for errors
- Verify JSON file format
- Ensure backend is running
- Check server logs: `docker-compose logs -f`

### Windows Portable: update fails with "path too long"

Windows limits paths to 260 characters (`MAX_PATH`) unless long paths are enabled,
which they are **not** by default. A few dependencies in the update payload nest deeply
enough to cross that line — the worst is ~210 characters before the install root is even
prepended — so on a long install root an update could abort partway through extraction
with `System.IO.PathTooLongException`, leaving a partial `versions\<version>\` folder.

**Fixed as of 2026-09-08:** the updater now extracts in-process through `\\?\`-prefixed
paths (`scripts/portable-updater/lib/extractZip.mjs`), which bypasses `MAX_PATH` at the
kernel level regardless of the registry setting. See `DECISIONS.md`'s "Portable Windows
Self-Update — MAX_PATH Extraction Failure" entry.

**Important caveat for the release that carries the fix.** The updater that performs an
update is the one the _previous_ release installed — `root/updater/` is only refreshed
from the new version after it boots successfully. So an install on an older build still
uses the old extractor for the hop _onto_ the fixed release, and is protected only from
that release onward. (Same doctrine as the pre-migration database snapshot: a fix in the
updater never protects the update that installs it.) Affected installs need one of:

- **Enable long paths** (Administrator, then reboot):
    ```powershell
    New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
    ```
- **Use a short install root** — `C:\SL\` rather than
  `D:\Story-Labyrinth-portable-win-x64\` — which buys back the ~35 characters that
  matter.

A failed update is non-destructive by design: the running version and its data are
untouched, so retrying after either change is safe.

Note for anyone cutting Windows builds: `Compress-Archive` is bound by the same limit, so
a build machine also wants long paths enabled.
