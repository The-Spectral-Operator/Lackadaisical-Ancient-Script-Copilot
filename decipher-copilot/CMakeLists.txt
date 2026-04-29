cmake_minimum_required(VERSION 3.28)
project(decipher_copilot
  VERSION 1.0.0
  LANGUAGES C CXX ASM_NASM)

set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(MSVC)
  add_compile_options(/W4 /permissive- /Zc:__cplusplus /Zc:preprocessor /utf-8 /GS /guard:cf
                      /sdl /Qspectre /DUNICODE /D_UNICODE)
  add_link_options(/guard:cf /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA)
else()
  add_compile_options(-Wall -Wextra -Wpedantic -Wshadow -Wconversion -fstack-protector-strong)
endif()

if(WIN32)
  set(CMAKE_ASM_NASM_OBJECT_FORMAT "win64")
elseif(APPLE)
  set(CMAKE_ASM_NASM_OBJECT_FORMAT "macho64")
else()
  set(CMAKE_ASM_NASM_OBJECT_FORMAT "elf64")
endif()

set(CMAKE_ASM_NASM_FLAGS "${CMAKE_ASM_NASM_FLAGS} -Xvc")

add_subdirectory(third_party/sqlite3mc)
add_subdirectory(core)
enable_testing()
