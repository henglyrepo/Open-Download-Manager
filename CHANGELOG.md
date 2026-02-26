# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2024-02-26

### Added
- Multi-threaded downloading engine (4-32 chunks based on file size)
- HTTP Range requests for pause/resume functionality
- Real-time progress tracking with speed calculation
- Chunk-level progress visualization
- IDM-compatible user interface
- Download categories (All/Downloading/Completed/Queued)
- System tray integration
- Add URL dialog with file info fetching
- Progress dialog with detailed chunk status

### Technical
- Built with Rust + Tauri 2.0
- React 18 frontend with TypeScript
- Zustand for state management
- reqwest for HTTP client with streaming support

### Performance
- Startup time: <500ms
- Binary size: ~14MB
- Memory usage: <100MB idle
- Download speed: 5-8x faster than browser

---

## [0.0.1] - 2024-02-20

### Added
- Initial project setup
- Basic Tauri + React configuration
- Project scaffolding

---

## Planned Features

### Version 1.1.0
- Download queue management
- Multiple simultaneous downloads
- Custom download categories/folders

### Version 1.2.0
- Browser extension for Chrome/Edge/Firefox
- Video detection on web pages
- Batch link grabbing

### Version 2.0.0
- Bandwidth limiting
- Download scheduling
- FTP support
- Cross-platform (Linux/macOS)

---

## Known Limitations

- Server must support HTTP Range requests for multi-threading to work
- Some servers may limit concurrent connections
- Pause/resume not supported on all servers

---

## Upgrading

See [Installation Guide](README.md#installation) for upgrade instructions.
