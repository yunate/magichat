#include "windowsCommandLine.h"
#include "windowsError.h"
#include "windowsHandle.h"
#include "utils/fileSystemUtils.h"
#include "utils/stringUtils.h"

#include <shellapi.h>

#include <array>
#include <charconv>
#include <cstdint>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

using magichat::native::quoteWindowsArgument;
using magichat::native::throwWindowsError;
using magichat::native::UniqueFindHandle;
using magichat::native::UniqueHandle;
using magichat::launcher::utils::getApplicationRoot;
using magichat::launcher::utils::isDirectory;
using magichat::launcher::utils::isFile;
using magichat::launcher::utils::joinPath;
using magichat::launcher::utils::toWideMessage;

constexpr std::size_t VERSION_COMPONENT_COUNT = 4;
constexpr DWORD MAX_ACTIVE_VERSION_BYTES = 64;
constexpr wchar_t ACTIVE_VERSION_FILE_NAME[] = L"active-version";
constexpr wchar_t VERSION_DIRECTORY_NAME[] = L"version";
constexpr wchar_t APPLICATION_EXECUTABLE_NAME[] = L"MagicHat.exe";

class LocalArguments {
public:
  LocalArguments() : _values(CommandLineToArgvW(GetCommandLineW(), &_count)) {
    if (_values == nullptr) {
      throwWindowsError("Failed to parse launcher arguments", GetLastError());
    }
  }

  ~LocalArguments() {
    LocalFree(_values);
  }

  LocalArguments(const LocalArguments&) = delete;
  LocalArguments& operator=(const LocalArguments&) = delete;

  int count() const { return _count; }
  wchar_t* const* values() const { return _values; }

private:
  int _count = 0;
  LPWSTR* _values;
};

class Version {
public:
  static std::optional<Version> parse(std::string_view text) {
    Version result{};
    std::size_t offset = 0;
    for (std::size_t index = 0; index < VERSION_COMPONENT_COUNT; ++index) {
      const std::size_t separator = text.find('.', offset);
      const std::size_t end = index + 1 == VERSION_COMPONENT_COUNT
        ? text.size()
        : separator;
      if (end == std::string_view::npos || end == offset) return std::nullopt;
      std::uint32_t component = 0;
      const char* beginPointer = text.data() + offset;
      const char* endPointer = text.data() + end;
      const auto parseResult = std::from_chars(beginPointer, endPointer, component);
      if (parseResult.ec != std::errc() || parseResult.ptr != endPointer) {
        return std::nullopt;
      }
      result._components[index] = component;
      offset = end + 1;
    }
    if (offset != text.size() + 1) return std::nullopt;
    result._text.assign(text);
    return result;
  }

  static std::optional<Version> parse(std::wstring_view text) {
    std::string narrowText;
    narrowText.reserve(text.size());
    for (const wchar_t character : text) {
      if (character > 0x7f) return std::nullopt;
      narrowText.push_back(static_cast<char>(character));
    }
    return parse(narrowText);
  }

  bool operator<(const Version& other) const {
    return _components < other._components;
  }

  std::wstring wideText() const {
    return std::wstring(_text.begin(), _text.end());
  }

  const std::string& text() const {
    return _text;
  }

private:
  std::array<std::uint32_t, VERSION_COMPONENT_COUNT> _components{};
  std::string _text;
};

class Launcher {
public:
  Launcher()
    : _applicationRoot(getApplicationRoot()),
      _activeVersionPath(joinPath(_applicationRoot, ACTIVE_VERSION_FILE_NAME)),
      _versionRoot(joinPath(_applicationRoot, VERSION_DIRECTORY_NAME)) {}

  void run(int argumentCount, wchar_t* const arguments[]) const {
    Version activeVersion = readActiveVersion();
    std::wstring activeDirectory = getVersionDirectory(activeVersion);
    if (!isDirectory(activeDirectory)) {
      const std::optional<Version> latestVersion = findLatestVersion();
      if (!latestVersion.has_value()) {
        throw std::runtime_error("No launchable MagicHat version is installed");
      }
      activeVersion = latestVersion.value();
      activeDirectory = getVersionDirectory(activeVersion);
      writeActiveVersion(activeVersion);
    }
    if (!isFile(joinPath(activeDirectory, APPLICATION_EXECUTABLE_NAME))) {
      throw std::runtime_error("The active MagicHat version has no application executable");
    }
    launchApplication(activeDirectory, argumentCount, arguments);
  }

private:
  Version readActiveVersion() const {
    UniqueHandle file(CreateFileW(
      _activeVersionPath.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING,
      FILE_ATTRIBUTE_NORMAL, nullptr
    ));
    if (file.get() == INVALID_HANDLE_VALUE) {
      throwWindowsError("Failed to open active-version", GetLastError());
    }
    LARGE_INTEGER size{};
    if (!GetFileSizeEx(file.get(), &size)) {
      throwWindowsError("Failed to inspect active-version", GetLastError());
    }
    if (size.QuadPart <= 0 || size.QuadPart > MAX_ACTIVE_VERSION_BYTES) {
      throw std::runtime_error("active-version has an invalid length");
    }
    std::string content(static_cast<std::size_t>(size.QuadPart), '\0');
    DWORD bytesRead = 0;
    if (!ReadFile(file.get(), content.data(), static_cast<DWORD>(content.size()), &bytesRead, nullptr)
      || bytesRead != content.size()) {
      throwWindowsError("Failed to read active-version", GetLastError());
    }
    if (content.ends_with("\r\n")) {
      content.resize(content.size() - 2);
    } else if (content.ends_with("\n")) {
      content.resize(content.size() - 1);
    }
    const std::optional<Version> version = Version::parse(content);
    if (!version.has_value()) {
      throw std::runtime_error("active-version must contain one four-component version");
    }
    return version.value();
  }

  std::wstring getVersionDirectory(const Version& version) const {
    return joinPath(_versionRoot, version.wideText());
  }

  bool isLaunchableVersion(const Version& version) const {
    const std::wstring directory = getVersionDirectory(version);
    return isDirectory(directory)
      && isFile(joinPath(directory, APPLICATION_EXECUTABLE_NAME));
  }

  std::optional<Version> findLatestVersion() const {
    WIN32_FIND_DATAW entry{};
    const std::wstring pattern = joinPath(_versionRoot, L"*");
    const HANDLE rawFindHandle = FindFirstFileW(pattern.c_str(), &entry);
    if (rawFindHandle == INVALID_HANDLE_VALUE) {
      const DWORD error = GetLastError();
      if (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND) return std::nullopt;
      throwWindowsError("Failed to enumerate installed versions", error);
    }
    const UniqueFindHandle findHandle(rawFindHandle);
    std::optional<Version> latest;
    do {
      if ((entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0) continue;
      const std::wstring_view name(entry.cFileName);
      const std::optional<Version> candidate = Version::parse(name);
      if (!candidate.has_value() || !isLaunchableVersion(candidate.value())) continue;
      if (!latest.has_value() || latest.value() < candidate.value()) latest = candidate;
    } while (FindNextFileW(rawFindHandle, &entry));
    const DWORD enumerationError = GetLastError();
    if (enumerationError != ERROR_NO_MORE_FILES) {
      throwWindowsError("Failed to enumerate installed versions", enumerationError);
    }
    return latest;
  }

  void writeActiveVersion(const Version& version) const {
    wchar_t temporaryPath[MAX_PATH]{};
    if (GetTempFileNameW(_applicationRoot.c_str(), L"mhv", 0, temporaryPath) == 0) {
      throwWindowsError("Failed to create active-version temporary file", GetLastError());
    }
    UniqueHandle file(CreateFileW(
      temporaryPath, GENERIC_WRITE, 0, nullptr, TRUNCATE_EXISTING,
      FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH, nullptr
    ));
    if (file.get() == INVALID_HANDLE_VALUE) {
      throwWindowsError("Failed to open active-version temporary file", GetLastError());
    }
    DWORD bytesWritten = 0;
    if (!WriteFile(
      file.get(), version.text().data(), static_cast<DWORD>(version.text().size()),
      &bytesWritten, nullptr
    ) || bytesWritten != version.text().size()) {
      throwWindowsError("Failed to write active-version temporary file", GetLastError());
    }
    if (!FlushFileBuffers(file.get())) {
      throwWindowsError("Failed to flush active-version temporary file", GetLastError());
    }
    file.close();
    if (!ReplaceFileW(_activeVersionPath.c_str(), temporaryPath, nullptr, 0, nullptr, nullptr)) {
      throwWindowsError("Failed to replace active-version", GetLastError());
    }
  }

  void launchApplication(
    const std::wstring& versionDirectory,
    int argumentCount,
    wchar_t* const arguments[]
  ) const {
    const std::wstring executablePath = joinPath(versionDirectory, APPLICATION_EXECUTABLE_NAME);
    std::wstring commandLine = quoteWindowsArgument(executablePath);
    for (int index = 1; index < argumentCount; ++index) {
      commandLine.push_back(L' ');
      commandLine.append(quoteWindowsArgument(arguments[index]));
    }
    if (commandLine.size() >= 32'767) {
      throw std::runtime_error("Application command line is too long");
    }
    std::vector<wchar_t> mutableCommandLine(commandLine.begin(), commandLine.end());
    mutableCommandLine.push_back(L'\0');
    STARTUPINFOW startupInfo{};
    startupInfo.cb = sizeof(startupInfo);
    PROCESS_INFORMATION processInfo{};
    if (!CreateProcessW(
      executablePath.c_str(), mutableCommandLine.data(), nullptr, nullptr, FALSE, 0,
      nullptr, versionDirectory.c_str(), &startupInfo, &processInfo
    )) {
      throwWindowsError("Failed to start MagicHat", GetLastError());
    }
    const UniqueHandle process(processInfo.hProcess);
    const UniqueHandle thread(processInfo.hThread);
  }

  std::wstring _applicationRoot;
  std::wstring _activeVersionPath;
  std::wstring _versionRoot;
};

} // namespace

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  try {
    const LocalArguments arguments;
    const Launcher launcher;
    launcher.run(arguments.count(), arguments.values());
    return 0;
  } catch (const std::exception& error) {
    const std::wstring message = toWideMessage(error.what());
    MessageBoxW(nullptr, message.c_str(), L"MagicHat Launcher", MB_OK | MB_ICONERROR);
    return 1;
  }
}