# ADR 0004: SQLite Idempotency Ledger v0 & Cross-Platform Filesystem Rules

## Status
Accepted

## Context
In Task U0-01, we implemented the SQLite WAL-mode Idempotency Ledger v0 and resolved a CI failure on Windows runners during parallel test fixture execution.

## Decisions

### 1. Cross-Platform Asynchronous Directory Creation
- **Rule**: All asynchronous directory creation calls (`mkdir`) targeting nested paths or executing within parallel asynchronous constructs (`Promise.all`) MUST specify `{ recursive: true }`.
- **Rationale**: On Windows NTFS filesystems, concurrent non-recursive `mkdir` calls can raise `ENOENT: no such file or directory` if a parent directory creation operation is still pending.

### 2. Built-in `node:sqlite` for Node 22+ Runtimes
- **Rule**: Local AI Relay uses the native `node:sqlite` module (`DatabaseSync`) for SQLite database interactions.
- **Rationale**: Built into Node >= 22.5.0, `node:sqlite` eliminates native C++ compilation dependencies (e.g. `better-sqlite3`), guaranteeing identical behavior across Linux, Windows, and macOS without supply-chain binary compilation failures.

## Consequences
- Windows CI pipelines execute deterministically without directory creation race conditions.
- SQLite ledger operates natively without external native npm dependencies.
