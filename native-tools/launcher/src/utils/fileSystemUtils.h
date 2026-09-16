#pragma once

#define NOMINMAX
#include <windows.h>
#include <shlobj.h>

#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>

namespace magichat::launcher::utils {

inline std::wstring joinPath(std::wstring_view parent, std::wstring_view child) {
  std::wstring result(parent);
  if (!result.empty() && result.back() != L'\\') result.push_back(L'\\');
  result.append(child);
  return result;
}

inline bool isDirectory(const std::wstring& path) {
  const DWORD attributes = GetFileAttributesW(path.c_str());
  return attributes != INVALID_FILE_ATTRIBUTES
    && (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
}

inline bool isFile(const std::wstring& path) {
  const DWORD attributes = GetFileAttributesW(path.c_str());
  return attributes != INVALID_FILE_ATTRIBUTES
    && (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

inline std::wstring getApplicationRoot() {
  PWSTR localAppData = nullptr;
  const HRESULT result = SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &localAppData);
  if (FAILED(result) || localAppData == nullptr) {
    throw std::runtime_error("Failed to resolve Local AppData");
  }
  const std::unique_ptr<wchar_t, decltype(&CoTaskMemFree)> owner(localAppData, &CoTaskMemFree);
  return joinPath(localAppData, L"MagicHat");
}

} // namespace magichat::launcher::utils