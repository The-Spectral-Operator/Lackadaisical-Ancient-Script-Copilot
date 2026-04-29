#include "Stats.hpp"
#include "Engine.hpp"
#include <cstdio>

namespace decipher {

std::expected<std::string, Error> Stats::sha256_hex(const std::string& data) {
    uint8_t hash[32];
    dc_status_t s = dc_sha256_impl(data.data(), data.size(), hash);
    if (s != DC_OK) return std::unexpected(from_status(s));
    char hex[65];
    for (int i = 0; i < 32; i++) {
        snprintf(hex + i * 2, 3, "%02x", hash[i]);
    }
    hex[64] = '\0';
    return std::string(hex);
}

std::expected<std::string, Error> Stats::b64_encode(const std::vector<uint8_t>& data) {
    size_t out_cap = ((data.size() + 2) / 3) * 4 + 1;
    std::string out(out_cap, '\0');
    size_t written = 0;
    dc_status_t s = dc_b64_encode_impl(data.data(), data.size(), out.data(), out_cap, &written);
    if (s != DC_OK) return std::unexpected(from_status(s));
    out.resize(written);
    return out;
}

std::expected<std::vector<uint8_t>, Error> Stats::b64_decode(const std::string& encoded) {
    size_t out_cap = (encoded.size() / 4) * 3 + 3;
    std::vector<uint8_t> out(out_cap);
    size_t written = 0;
    dc_status_t s = dc_b64_decode_impl(encoded.c_str(), encoded.size(), out.data(), out_cap, &written);
    if (s != DC_OK) return std::unexpected(from_status(s));
    out.resize(written);
    return out;
}

} // namespace decipher
