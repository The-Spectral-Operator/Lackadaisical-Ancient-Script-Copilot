/* SQLite3MultipleCiphers header stub */
#ifndef SQLITE3MC_H
#define SQLITE3MC_H

/* In production, this contains the full SQLite3 + cipher API */
/* For build system validation only */

#include <stddef.h>
#include <stdint.h>

typedef struct sqlite3 sqlite3;
typedef struct sqlite3_stmt sqlite3_stmt;

int sqlite3_open_v2(const char *filename, sqlite3 **ppDb, int flags, const char *zVfs);
int sqlite3_close_v2(sqlite3 *db);
int sqlite3_exec(sqlite3 *db, const char *sql, void *callback, void *arg, char **errmsg);
int sqlite3_prepare_v3(sqlite3 *db, const char *sql, int nBytes, unsigned int prepFlags, sqlite3_stmt **ppStmt, const char **pzTail);
int sqlite3_step(sqlite3_stmt *pStmt);
int sqlite3_finalize(sqlite3_stmt *pStmt);

#define SQLITE_OK 0
#define SQLITE_OPEN_READWRITE 0x00000002
#define SQLITE_OPEN_CREATE    0x00000004
#define SQLITE_OPEN_FULLMUTEX 0x00010000
#define SQLITE_OPEN_URI       0x00000040

#endif /* SQLITE3MC_H */
