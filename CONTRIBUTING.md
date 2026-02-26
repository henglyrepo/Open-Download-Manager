# Contributing to OpenDM

Thank you for your interest in contributing to OpenDM! This document provides guidelines for contributing to this project.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please be respectful and constructive.

## How Can I Contribute?

### 🐛 Reporting Bugs

1. **Search existing issues** - Check if the bug has already been reported
2. **Create a new issue** - Use the bug report template
3. **Include**:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Your environment (OS, version)

### 💡 Suggesting Features

1. **Search existing suggestions** - Avoid duplicates
2. **Open a discussion** - Propose your idea
3. **Explain**:
   - The problem you're solving
   - Your proposed solution
   - Alternatives considered

### 💻 Contributing Code

#### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/henglyrepo/Open-Download-Manager.git
cd Open-Download-Manager

# Install dependencies
npm install

# Run development server
npm run tauri dev

# Build for production
npm run tauri build
```

#### Project Structure

```
opendm/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── stores/            # Zustand state management
│   ├── hooks/             # Custom React hooks
│   └── types/             # TypeScript types
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── download/      # Download engine
│   │   ├── http/          # HTTP client
│   │   └── lib.rs         # Tauri commands
│   └── Cargo.toml         # Rust dependencies
└── package.json           # Node dependencies
```

#### Coding Standards

**Rust:**
- Run `cargo fmt` before committing
- Run `cargo clippy -- -D warnings` to check for issues
- Add documentation for public APIs
- Write unit tests for new features

**TypeScript/React:**
- Follow existing code style
- Use meaningful variable names
- Add TypeScript types for new interfaces
- Component props should be typed

#### Pull Request Process

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make your changes**
   - Follow coding standards
   - Add tests if applicable
   - Update documentation

3. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing new feature"
   ```

   We use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation
   - `refactor:` - Code refactoring
   - `test:` - Adding tests

4. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **PR Description should include**:
   - Clear description of changes
   - Related issue numbers
   - Screenshots for UI changes
   - Testing steps

### 🌍 Translations

Want to add translations? Here's how:

1. Identify the strings to translate
2. Create a new locale file
3. Add translation keys and values
4. Submit as a PR

---

## Development Workflow

### Running Tests

```bash
# Frontend
npm run build

# Backend (Rust)
cd src-tauri
cargo build
cargo test
```

### Debugging

```bash
# Development mode with hot reload
npm run tauri dev

# Check Rust logs
# Logs are in: %APPDATA%\com.opendm.download\logs
```

---

## Recognition

Contributors will be recognized in:
- README.md contributors section
- GitHub release notes

---

## Questions?

- Open a [GitHub Discussion](https://github.com/henglyrepo/Open-Download-Manager/discussions)
- Check existing [Issues](https://github.com/henglyrepo/Open-Download-Manager/issues)

Thank you for contributing! 🚀
