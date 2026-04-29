/*
 * SQLite3MultipleCiphers header — Build-system integration.
 *
 * In the production build, replace this file with the full sqlite3mc.h from:
 *   https://github.com/utelle/SQLite3MultipleCiphers
 * Version: 2.x (SQLCipher v4 compatible, AES-256-CBC + HMAC-SHA-512)
 *
 * This minimal header provides type declarations and constants sufficient
 * for compiling the C core engine (dc_db.c) against the SQLite3 C API.
 * The actual encryption implementation is linked from the sqlite3mc static
 * library built via third_party/sqlite3mc/CMakeLists.txt.
 */
#ifndef SQLITE3MC_H
#define SQLITE3MC_H

#include <stddef.h>
#include <stdint.h>

typedef struct sqlite3 sqlite3;
typedef struct sqlite3_stmt sqlite3_stmt;
typedef int (*sqlite3_callback)(void*, int, char**, char**);

/* Core API functions */
int sqlite3_open_v2(const char *filename, sqlite3 **ppDb, int flags, const char *zVfs);
int sqlite3_close_v2(sqlite3 *db);
int sqlite3_exec(sqlite3 *db, const char *sql, sqlite3_callback callback, void *arg, char **errmsg);
int sqlite3_prepare_v3(sqlite3 *db, const char *sql, int nBytes, unsigned int prepFlags,
                       sqlite3_stmt **ppStmt, const char **pzTail);
int sqlite3_step(sqlite3_stmt *pStmt);
int sqlite3_finalize(sqlite3_stmt *pStmt);
int sqlite3_reset(sqlite3_stmt *pStmt);
int sqlite3_bind_text(sqlite3_stmt*, int, const char*, int, void(*)(void*));
int sqlite3_bind_int64(sqlite3_stmt*, int, int64_t);
int sqlite3_bind_double(sqlite3_stmt*, int, double);
int sqlite3_bind_null(sqlite3_stmt*, int);
int sqlite3_bind_blob(sqlite3_stmt*, int, const void*, int, void(*)(void*));
const char *sqlite3_column_text(sqlite3_stmt*, int);
int sqlite3_column_int(sqlite3_stmt*, int);
int64_t sqlite3_column_int64(sqlite3_stmt*, int);
double sqlite3_column_double(sqlite3_stmt*, int);
const void *sqlite3_column_blob(sqlite3_stmt*, int);
int sqlite3_column_bytes(sqlite3_stmt*, int);
int sqlite3_column_count(sqlite3_stmt*);
void sqlite3_free(void*);
int sqlite3_changes(sqlite3*);
const char *sqlite3_errmsg(sqlite3*);

/* Result codes */
#define SQLITE_OK          0
#define SQLITE_ERROR       1
#define SQLITE_BUSY        5
#define SQLITE_ROW         100
#define SQLITE_DONE        101

/* Flags for sqlite3_open_v2 */
#define SQLITE_OPEN_READONLY     0x00000001
#define SQLITE_OPEN_READWRITE    0x00000002
#define SQLITE_OPEN_CREATE       0x00000004
#define SQLITE_OPEN_NOMUTEX      0x00008000
#define SQLITE_OPEN_FULLMUTEX    0x00010000
#define SQLITE_OPEN_URI          0x00000040

/* Prepare flags */
#define SQLITE_PREPARE_PERSISTENT 0x01

/* Transient destructor */
#define SQLITE_TRANSIENT ((void(*)(void*))-1)

#endif /* SQLITE3MC_H */
