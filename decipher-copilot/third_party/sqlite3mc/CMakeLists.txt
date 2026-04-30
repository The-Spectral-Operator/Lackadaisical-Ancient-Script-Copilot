add_library(sqlite3mc STATIC sqlite3mc.c)
target_include_directories(sqlite3mc PUBLIC .)
target_compile_definitions(sqlite3mc PUBLIC
  SQLITE_THREADSAFE=1
  SQLITE_ENABLE_FTS5
  SQLITE_ENABLE_JSON1
  SQLITE_ENABLE_RTREE
  SQLITE_USE_URI=1
  SQLITE_DEFAULT_WAL_SYNCHRONOUS=1)
