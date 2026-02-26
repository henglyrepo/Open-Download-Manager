# OpenDM - Open Source Download Manager

## Project Overview

**Project Name:** OpenDM  
**Type:** Desktop Application (Windows)  
**Goal:** Replace IDM with open-source, faster, modern alternative  
**Tech Stack:** Rust (backend) + React/TypeScript (UI) + Tauri 2.0

---

## Architecture

### Layers
```
┌─────────────────────────────────────────┐
│           UI (React + TypeScript)        │
│  Components │ Stores │ Hooks            │
├─────────────────────────────────────────┤
│         Tauri IPC Bridge                │
├─────────────────────────────────────────┤
│      Rust Backend (Tauri Commands)      │
│  Download Engine │ HTTP │ Storage       │
└─────────────────────────────────────────┘
```

### Key Modules

#### Rust Backend (`src-tauri/src/`)
| Module | Responsibility |
|--------|----------------|
| `download/mod.rs` | DownloadManager - coordinates chunks |
| `download/chunk.rs` | Chunk handler - individual segment download |
| `download/assembler.rs` | File merger - combines chunks |
| `download/scheduler.rs` | Queue scheduler |
| `http/client.rs` | HTTP client wrapper (reqwest) |
| `storage/db.rs` | SQLite for download metadata |
| `commands.rs` | Tauri IPC commands |

#### Frontend (`src/`)
| Module | Responsibility |
|--------|----------------|
| `components/Sidebar.tsx` | Category navigation |
| `components/DownloadList.tsx` | Main download table |
| `components/AddUrlDialog.tsx` | Add new download |
| `components/ProgressDialog.tsx` | Download progress |
| `components/Toolbar.tsx` | Action buttons |
| `stores/downloadStore.ts` | Zustand state management |

---

## Development Workflow

### 1. Project Setup
```bash
# Prerequisites
- Node.js 18+
- Rust 1.70+
- cargo-tauri CLI

# Initialize
npm create tauri-app@latest opendm -- --template react-ts
cd opendm
npm install
```

### 2. Running Development
```bash
# Terminal 1: Frontend
npm run tauri dev

# This runs both frontend and backend in hot-reload mode
```

### 3. Building
```bash
# Build for production
npm run tauri build

# Output: src-tauri/target/release/opendm.exe
```

---

## Key Features Implementation

### Multi-Threaded Download
1. Send HEAD request to get file size + check `Accept-Ranges`
2. Split file into N chunks (8-16 based on size)
3. Each chunk downloads via separate async task with `Range` header
4. Merge chunks using file offset writes

### Progress Tracking
- Each chunk emits progress events via Tauri events
- Frontend subscribes to progress updates
- Real-time speed calculation (bytes/second)

### Pause/Resume
- Save download state to SQLite on pause
- On resume, read saved byte offsets
- Request remaining range from server

### Categories
- **All** - All downloads
- **Downloading** - Active downloads
- **Completed** - Finished downloads
- **Queued** - Scheduled/pending
- **Scheduled** - Time-scheduled downloads

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Speed vs Browser | 5-8x faster |
| Startup Time | < 500ms |
| Memory Usage | < 100MB idle |
| Binary Size | < 20MB |

### Performance Optimizations
- Dynamic chunk count (8-32 based on file size)
- HTTP/2 multiplexing via reqwest
- Connection pooling
- TCP_NODELAY for latency reduction
- Zero-copy file writes

---

## UI Design (IDM-Compatible)

### Main Window Layout
```
┌────────────────────────────────────────────────────┐
│ [Icon] OpenDM                    [_] [□] [X]      │
├────────────────────────────────────────────────────┤
│ [+Add URL] [▶Start] [⏸Pause] [■Stop] [🗑Delete]   │
├──────────────┬─────────────────────────────────────┤
│ CATEGORIES   │ File    │ Size │ %   │ Speed │ Stat│
│ ├─ All (24)  │ file1   │100MB│ 45% │ 5MB/s │ ⬇   │
│ ├─ Downloading│ video  │500MB│ 12% │ 8MB/s │ ⬇   │
│ ├─ Completed │ doc.pdf │ 10MB│ --  │ --    │ ✓   │
│ ├─ Queued    │ archive │ 1GB │ --  │ --    │ ⏳  │
│ └─ Scheduled │         │     │     │       │     │
├──────────────┴─────────────────────────────────────┤
│ [3] Downloads │ 13MB/s │ 1.6GB    [Tray: ▼]     │
└────────────────────────────────────────────────────┘
```

### Progress Dialog
```
┌──────────────────────────────────┐
│ Downloading: video.mp4           │
├──────────────────────────────────┤
│ ████████████░░░░░░░░░  45%      │
│ Chunk 1: ██████████░░  80%      │
│ Chunk 2: ████████░░░░  60%      │
│ Chunk 3: ████████░░░░  70%      │
│ Chunk 4: ████░░░░░░░░  30%      │
├──────────────────────────────────┤
│ Speed: 8.2 MB/s │ ETA: 1:23     │
│ [⏸Pause]  [Cancel]              │
└──────────────────────────────────┘
```

---

## Dependencies

### Rust (src-tauri/Cargo.toml)
```toml
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "http2", "stream"] }
rusqlite = { version = "0.32", features = ["bundled"] }
serde = { version = "1", features = ["derive"] }
tauri = { version = "2", features = ["tray-icon", "devtools"] }
tracing = "0.1"
tracing-subscriber = "0.3"
futures = "0.3"
```

### Frontend (package.json)
```json
{
  "react": "^18.2.0",
  "zustand": "^4.5.0",
  "@tauri-apps/api": "^2.0.0",
  "lucide-react": "^0.400.0",
  "react-hook-form": "^7.51.0"
}
```

---

## Testing

### Manual Testing
1. Add URL test: `https://speed.hetzner.de/1GB.bin`
2. Verify chunk creation (4+ chunks)
3. Verify pause/resume works
4. Verify speed improvement vs browser

### Benchmark
- Test file: 1GB from fast server
- Compare: Browser vs OpenDM vs IDM
- Expected: OpenDM >= IDM speed

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run tauri dev` | Start development |
| `npm run tauri build` | Build production |
| `npm run tauri build -- --debug` | Debug build |

---

## Notes

- Always use `tracing` for logging in Rust
- Emit progress via Tauri events, not polling
- Save state on every pause/crash for resume capability
- Handle server not supporting Range requests gracefully
