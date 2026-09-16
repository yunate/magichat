#pragma once

#define NOMINMAX
#include <windows.h>

#include <stdexcept>
#include <string>

namespace magichat::native {

[[noreturn]] inline void throwWindowsError(const char* operation, DWORD error) {
  throw std::runtime_error(std::string(operation) + " (Windows error "
    + std::to_string(error) + ")");
}

} // namespace magichat::native