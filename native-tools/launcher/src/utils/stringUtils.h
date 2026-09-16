#pragma once

#define NOMINMAX
#include <windows.h>

#include <string>
#include <string_view>

namespace magichat::launcher::utils {

inline std::wstring toWideMessage(std::string_view message) {
  if (message.empty()) return L"MagicHat launcher failed";
  const int length = MultiByteToWideChar(
    CP_UTF8, MB_ERR_INVALID_CHARS, message.data(), static_cast<int>(message.size()), nullptr, 0
  );
  if (length <= 0) return L"MagicHat launcher failed";
  std::wstring result(static_cast<std::size_t>(length), L'\0');
  MultiByteToWideChar(
    CP_UTF8, MB_ERR_INVALID_CHARS, message.data(), static_cast<int>(message.size()),
    result.data(), length
  );
  return result;
}

} // namespace magichat::launcher::utils