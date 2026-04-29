#pragma once
#include <string>
#include <memory>
#include <expected>
#include <vector>

extern "C" {
#include "dc_api.h"
#include "dc_corpus.h"
}

namespace decipher {

enum class Error {
    NullPtr, Alloc, Db, Parse, Io, InvalidArg, Overflow, NotFound, Internal
};

inline Error from_status(dc_status_t s) {
    switch (s) {
        case DC_ERR_NULL_PTR:    return Error::NullPtr;
        case DC_ERR_ALLOC:       return Error::Alloc;
        case DC_ERR_DB:          return Error::Db;
        case DC_ERR_PARSE:       return Error::Parse;
        case DC_ERR_IO:          return Error::Io;
        case DC_ERR_INVALID_ARG: return Error::InvalidArg;
        case DC_ERR_OVERFLOW:    return Error::Overflow;
        case DC_ERR_NOT_FOUND:   return Error::NotFound;
        default:                 return Error::Internal;
    }
}

class Engine {
public:
    static std::expected<Engine, Error> create(const std::string& db_path, const std::string& hex_key);
    ~Engine();
    Engine(Engine&&) noexcept;
    Engine& operator=(Engine&&) noexcept;
    Engine(const Engine&) = delete;
    Engine& operator=(const Engine&) = delete;

    dc_engine* raw() const { return m_engine; }

private:
    explicit Engine(dc_engine* e) : m_engine(e) {}
    dc_engine* m_engine = nullptr;
};

} // namespace decipher
