/*
 * SQLite3MultipleCiphers amalgamation — Build-system integration.
 *
 * PRODUCTION DEPLOYMENT:
 * Replace this file with the full sqlite3mc.c amalgamation from:
 *   https://github.com/utelle/SQLite3MultipleCiphers/releases
 * Version required: 2.x (provides SQLCipher v4 cipher + AES-256-CBC format)
 *
 * The full amalgamation (~240k lines) bundles SQLite 3.46.x + all cipher
 * implementations. It is not included in source control due to size.
 * The CMakeLists.txt in this directory compiles it as a static library
 * (sqlite3mc) linked into decipher-core.dll.
 *
 * BUILD INSTRUCTIONS:
 * 1. Download sqlite3mc.c from the release assets
 * 2. Place it at: third_party/sqlite3mc/sqlite3mc.c (replacing this file)
 * 3. Run: cmake --preset windows-release && cmake --build --preset windows-release
 *
 * This placeholder file provides no-op symbol definitions that allow the
 * build system to validate the CMake configuration and link structure
 * without the full amalgamation. The Node.js server tier uses
 * better-sqlite3-multiple-ciphers (npm) which bundles its own copy.
 */
#include "sqlite3mc.h"
#include <stdlib.h>

/* Minimal no-op implementations for build-system validation only.
 * These are NEVER used at runtime — the production build links the real amalgamation. */

int sqlite3_open_v2(const char *filename, sqlite3 **ppDb, int flags, const char *zVfs) {
    (void)filename; (void)flags; (void)zVfs;
    *ppDb = NULL;
    return SQLITE_OK;
}

int sqlite3_close_v2(sqlite3 *db) {
    (void)db;
    return SQLITE_OK;
}

int sqlite3_exec(sqlite3 *db, const char *sql, sqlite3_callback cb, void *arg, char **errmsg) {
    (void)db; (void)sql; (void)cb; (void)arg;
    if (errmsg) *errmsg = NULL;
    return SQLITE_OK;
}

int sqlite3_prepare_v3(sqlite3 *db, const char *sql, int nBytes, unsigned int prepFlags,
                       sqlite3_stmt **ppStmt, const char **pzTail) {
    (void)db; (void)sql; (void)nBytes; (void)prepFlags; (void)pzTail;
    *ppStmt = NULL;
    return SQLITE_OK;
}

int sqlite3_step(sqlite3_stmt *pStmt) { (void)pStmt; return SQLITE_DONE; }
int sqlite3_finalize(sqlite3_stmt *pStmt) { (void)pStmt; return SQLITE_OK; }
int sqlite3_reset(sqlite3_stmt *pStmt) { (void)pStmt; return SQLITE_OK; }
int sqlite3_bind_text(sqlite3_stmt *s, int i, const char *t, int n, void(*d)(void*)) { (void)s;(void)i;(void)t;(void)n;(void)d; return SQLITE_OK; }
int sqlite3_bind_int64(sqlite3_stmt *s, int i, int64_t v) { (void)s;(void)i;(void)v; return SQLITE_OK; }
int sqlite3_bind_double(sqlite3_stmt *s, int i, double v) { (void)s;(void)i;(void)v; return SQLITE_OK; }
int sqlite3_bind_null(sqlite3_stmt *s, int i) { (void)s;(void)i; return SQLITE_OK; }
int sqlite3_bind_blob(sqlite3_stmt *s, int i, const void *b, int n, void(*d)(void*)) { (void)s;(void)i;(void)b;(void)n;(void)d; return SQLITE_OK; }
const char *sqlite3_column_text(sqlite3_stmt *s, int i) { (void)s;(void)i; return ""; }
int sqlite3_column_int(sqlite3_stmt *s, int i) { (void)s;(void)i; return 0; }
int64_t sqlite3_column_int64(sqlite3_stmt *s, int i) { (void)s;(void)i; return 0; }
double sqlite3_column_double(sqlite3_stmt *s, int i) { (void)s;(void)i; return 0.0; }
const void *sqlite3_column_blob(sqlite3_stmt *s, int i) { (void)s;(void)i; return NULL; }
int sqlite3_column_bytes(sqlite3_stmt *s, int i) { (void)s;(void)i; return 0; }
int sqlite3_column_count(sqlite3_stmt *s) { (void)s; return 0; }
void sqlite3_free(void *p) { free(p); }
int sqlite3_changes(sqlite3 *db) { (void)db; return 0; }
const char *sqlite3_errmsg(sqlite3 *db) { (void)db; return "build-system placeholder"; }
