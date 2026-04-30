file(GLOB CORE_C_SRC CONFIGURE_DEPENDS src/*.c)
file(GLOB CORE_CPP_SRC CONFIGURE_DEPENDS cpp/*.cpp)

if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
  set(CORE_ASM_SRC
    asm/sha256_avx2.asm
    asm/base64_avx2.asm
    asm/freq_count_avx2.asm
    asm/log2_lookup.asm
    asm/memzero_secure.asm)
else()
  set(CORE_ASM_SRC "")
endif()

add_library(decipher_core SHARED
  ${CORE_C_SRC} ${CORE_CPP_SRC} ${CORE_ASM_SRC})
target_include_directories(decipher_core PUBLIC include)
target_link_libraries(decipher_core PRIVATE m)

if(MSVC)
  target_link_libraries(decipher_core PRIVATE)
endif()

set_target_properties(decipher_core PROPERTIES
  OUTPUT_NAME "decipher-core"
  WINDOWS_EXPORT_ALL_SYMBOLS OFF)

# Tests
add_executable(test_entropy tests/test_entropy.c)
target_link_libraries(test_entropy PRIVATE decipher_core)
add_test(NAME entropy COMMAND test_entropy)

add_executable(test_zipf tests/test_zipf.c)
target_link_libraries(test_zipf PRIVATE decipher_core)
add_test(NAME zipf COMMAND test_zipf)

add_executable(test_sha256 tests/test_sha256.c)
target_link_libraries(test_sha256 PRIVATE decipher_core)
add_test(NAME sha256 COMMAND test_sha256)

add_executable(test_b64 tests/test_b64.c)
target_link_libraries(test_b64 PRIVATE decipher_core)
add_test(NAME b64 COMMAND test_b64)

add_executable(test_align tests/test_align.c)
target_link_libraries(test_align PRIVATE decipher_core)
add_test(NAME align COMMAND test_align)

add_executable(test_db tests/test_db.c)
target_link_libraries(test_db PRIVATE decipher_core)
add_test(NAME db COMMAND test_db)
