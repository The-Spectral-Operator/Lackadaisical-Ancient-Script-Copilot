#pragma once
#include <string>
#include <expected>
#include <cstdint>
#include <vector>

extern "C" {
#include "dc_sha256.h"
#include "dc_b64.h"
}

namespace decipher {

class Stats {
public:
    static std::expected<std::string, Error> sha256_hex(const std::string& data);
    static std::expected<std::string, Error> b64_encode(const std::vector<uint8_t>& data);
    static std::expected<std::vector<uint8_t>, Error> b64_decode(const std::string& encoded);
};

} // namespace decipher
