#pragma once

#include <string>
#include <string_view>

namespace magichat::native {

inline std::wstring quoteWindowsArgument(std::wstring_view value) {
  if (value.empty()) return L"\"\"";
  if (value.find_first_of(L" \t\n\v\"") == std::wstring_view::npos) {
    return std::wstring(value);
  }
  std::wstring result = L"\"";
  std::size_t backslashCount = 0;
  for (const wchar_t character : value) {
    if (character == L'\\') {
      ++backslashCount;
    } else if (character == L'\"') {
      result.append(backslashCount * 2 + 1, L'\\');
      result.push_back(character);
      backslashCount = 0;
    } else {
      result.append(backslashCount, L'\\');
      backslashCount = 0;
      result.push_back(character);
    }
  }
  result.append(backslashCount * 2, L'\\');
  result.push_back(L'\"');
  return result;
}

} // namespace magichat::native