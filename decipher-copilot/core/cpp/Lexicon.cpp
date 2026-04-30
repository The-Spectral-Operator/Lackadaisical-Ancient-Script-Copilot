#include "Lexicon.hpp"
#include "Engine.hpp"

namespace decipher {

std::expected<Lexicon, Error> Lexicon::create() {
    dc_lexicon* raw = nullptr;
    dc_status_t s = dc_lexicon_create(&raw);
    if (s != DC_OK) return std::unexpected(from_status(s));
    return Lexicon(raw);
}

Lexicon::~Lexicon() {
    if (m_lex) dc_lexicon_free(m_lex);
}

Lexicon::Lexicon(Lexicon&& other) noexcept : m_lex(other.m_lex) {
    other.m_lex = nullptr;
}

Lexicon& Lexicon::operator=(Lexicon&& other) noexcept {
    if (this != &other) {
        if (m_lex) dc_lexicon_free(m_lex);
        m_lex = other.m_lex;
        other.m_lex = nullptr;
    }
    return *this;
}

std::expected<void, Error> Lexicon::add(const std::string& token, const std::string& gloss,
                                         const std::string& pos, double confidence) {
    dc_lexicon_entry_t entry = {0};
    entry.token = const_cast<char*>(token.c_str());
    entry.gloss = const_cast<char*>(gloss.c_str());
    entry.pos = const_cast<char*>(pos.c_str());
    entry.confidence = confidence;
    dc_status_t s = dc_lexicon_add_entry(m_lex, &entry);
    if (s != DC_OK) return std::unexpected(from_status(s));
    return {};
}

std::expected<std::string, Error> Lexicon::to_json() const {
    char* json = nullptr;
    dc_status_t s = dc_lexicon_to_json(m_lex, &json);
    if (s != DC_OK) return std::unexpected(from_status(s));
    std::string result(json);
    dc_free(json);
    return result;
}

} // namespace decipher
