#include "Engine.hpp"

namespace decipher {

std::expected<Engine, Error> Engine::create(const std::string& db_path, const std::string& hex_key) {
    dc_engine* raw = nullptr;
    dc_status_t s = dc_db_open(db_path.c_str(), hex_key.c_str(), &raw);
    if (s != DC_OK) return std::unexpected(from_status(s));
    return Engine(raw);
}

Engine::~Engine() {
    if (m_engine) dc_db_close(m_engine);
}

Engine::Engine(Engine&& other) noexcept : m_engine(other.m_engine) {
    other.m_engine = nullptr;
}

Engine& Engine::operator=(Engine&& other) noexcept {
    if (this != &other) {
        if (m_engine) dc_db_close(m_engine);
        m_engine = other.m_engine;
        other.m_engine = nullptr;
    }
    return *this;
}

} // namespace decipher
