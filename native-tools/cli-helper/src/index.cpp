#define NOMINMAX
#include <windows.h>

#include <cstdint>
#include <cwchar>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

constexpr std::size_t MAX_MESSAGE_LENGTH = 64 * 1024;
constexpr wchar_t PIPE_PATH_ENVIRONMENT_KEY[] = L"MAGICHAT_CLI_PIPE";
constexpr std::wstring_view CLI_ENVIRONMENT_KEY_PREFIX = L"MAGICHAT_CLI";

DWORD checkedDword(std::size_t value, const char* description) {
  if (value > std::numeric_limits<DWORD>::max()) throw std::runtime_error(description);
  return static_cast<DWORD>(value);
}

std::uint32_t checkedUInt32(std::size_t value, const char* description) {
  if (value > std::numeric_limits<std::uint32_t>::max()) throw std::runtime_error(description);
  return static_cast<std::uint32_t>(value);
}

std::string toUtf8(std::wstring_view value) {
  if (value.empty()) return {};
  const int size = WideCharToMultiByte(
    CP_UTF8,
    WC_ERR_INVALID_CHARS,
    value.data(),
    static_cast<int>(value.size()),
    nullptr,
    0,
    nullptr,
    nullptr
  );
  if (size <= 0) throw std::runtime_error("Failed to encode UTF-8 text");
  std::string result(static_cast<std::size_t>(size), '\0');
  if (WideCharToMultiByte(
    CP_UTF8,
    WC_ERR_INVALID_CHARS,
    value.data(),
    static_cast<int>(value.size()),
    result.data(),
    size,
    nullptr,
    nullptr
  ) != size) {
    throw std::runtime_error("Failed to encode UTF-8 text");
  }
  return result;
}

void validateUtf8(std::string_view value) {
  if (value.empty()) return;
  if (MultiByteToWideChar(
    CP_UTF8,
    MB_ERR_INVALID_CHARS,
    value.data(),
    static_cast<int>(value.size()),
    nullptr,
    0
  ) <= 0) {
    throw std::runtime_error("CLI Bridge response must be valid UTF-8");
  }
}

std::wstring readEnvironment(const wchar_t* key) {
  const DWORD size = GetEnvironmentVariableW(key, nullptr, 0);
  if (size == 0) throw std::runtime_error("MAGICHAT_CLI_PIPE is not configured");
  std::wstring value(size, L'\0');
  const DWORD written = GetEnvironmentVariableW(key, value.data(), size);
  if (written == 0 || written >= size) {
    throw std::runtime_error("Failed to read MAGICHAT_CLI_PIPE");
  }
  value.resize(written);
  return value;
}

struct CliResponse {
  bool successful;
  std::string message;
};

struct EnvironmentVariable {
  std::wstring key;
  std::wstring value;
};

class EnvironmentStrings {
public:
  EnvironmentStrings() : _data(GetEnvironmentStringsW()) {
    if (_data == nullptr) throw std::runtime_error("Failed to read CLI environment");
  }

  ~EnvironmentStrings() {
    FreeEnvironmentStringsW(_data);
  }

  EnvironmentStrings(const EnvironmentStrings&) = delete;
  EnvironmentStrings& operator=(const EnvironmentStrings&) = delete;

  std::vector<EnvironmentVariable> getCliVariables() const {
    std::vector<EnvironmentVariable> result;
    for (const wchar_t* current = _data; *current != L'\0'; current += std::wcslen(current) + 1) {
      const std::wstring_view entry(current);
      const std::size_t separator = entry.find(L'=');
      if (separator == std::wstring_view::npos || separator == 0) continue;
      const std::wstring_view key = entry.substr(0, separator);
      if (!hasCliPrefix(key)) continue;
      result.push_back({ std::wstring(key), std::wstring(entry.substr(separator + 1)) });
    }
    return result;
  }

private:
  static bool hasCliPrefix(std::wstring_view key) {
    if (key.size() < CLI_ENVIRONMENT_KEY_PREFIX.size()) return false;
    return CompareStringOrdinal(
      key.data(),
      static_cast<int>(CLI_ENVIRONMENT_KEY_PREFIX.size()),
      CLI_ENVIRONMENT_KEY_PREFIX.data(),
      static_cast<int>(CLI_ENVIRONMENT_KEY_PREFIX.size()),
      TRUE
    ) == CSTR_EQUAL;
  }

  LPWCH _data;
};

class CliProtocol {
public:
  static std::vector<std::uint8_t> encodeRequest(
    int argumentCount,
    wchar_t* arguments[],
    const std::vector<EnvironmentVariable>& environment
  ) {
    if (argumentCount < 1) throw std::runtime_error("CLI argument count is invalid");
    std::vector<std::uint8_t> result{ 'M', 'H', 'C', '3' };
    appendUInt32(result, checkedUInt32(environment.size(), "CLI environment count is too large"));
    appendUInt32(result, checkedUInt32(
      static_cast<std::size_t>(argumentCount - 1),
      "CLI argument count is too large"
    ));
    for (const EnvironmentVariable& variable : environment) {
      appendString(result, toUtf8(variable.key), "CLI environment key is too large");
      appendString(result, toUtf8(variable.value), "CLI environment value is too large");
    }
    for (int index = 1; index < argumentCount; ++index) {
      appendString(result, toUtf8(arguments[index]), "CLI argument is too large");
    }
    return result;
  }

  static CliResponse decodeResponse(const std::vector<std::uint8_t>& data) {
    const std::size_t expectedLength = responseFrameLength(data);
    if (expectedLength != data.size()) {
      throw std::runtime_error("CLI Bridge response length is invalid");
    }
    const std::string message(
      data.begin() + static_cast<std::ptrdiff_t>(RESPONSE_HEADER_LENGTH),
      data.end()
    );
    validateUtf8(message);
    return { data[4] == 1, message };
  }

  static std::size_t responseFrameLength(const std::vector<std::uint8_t>& header) {
    if (header.size() < RESPONSE_HEADER_LENGTH
      || header[0] != 'M' || header[1] != 'H' || header[2] != 'R' || header[3] != '1') {
      throw std::runtime_error("CLI Bridge response protocol is invalid");
    }
    if (header[4] > 1) throw std::runtime_error("CLI Bridge response status is invalid");
    const std::uint32_t messageLength = readUInt32(header, 5);
    if (messageLength > MAX_MESSAGE_LENGTH - RESPONSE_HEADER_LENGTH) {
      throw std::runtime_error("CLI Bridge response is too large");
    }
    return RESPONSE_HEADER_LENGTH + messageLength;
  }

  static constexpr std::size_t RESPONSE_HEADER_LENGTH = 9;

private:
  static void appendString(
    std::vector<std::uint8_t>& target,
    const std::string& value,
    const char* sizeError
  ) {
    appendUInt32(target, checkedUInt32(value.size(), sizeError));
    target.insert(target.end(), value.begin(), value.end());
    ensureSize(target.size(), "CLI Bridge request is too large");
  }

  static void appendUInt32(std::vector<std::uint8_t>& target, std::uint32_t value) {
    for (int shift = 0; shift < 32; shift += 8) {
      target.push_back(static_cast<std::uint8_t>(value >> shift));
    }
  }

  static std::uint32_t readUInt32(const std::vector<std::uint8_t>& source, std::size_t offset) {
    std::uint32_t value = 0;
    for (int shift = 0; shift < 32; shift += 8) {
      value |= static_cast<std::uint32_t>(source[offset++]) << shift;
    }
    return value;
  }

  static void ensureSize(std::size_t size, const char* message) {
    if (size > MAX_MESSAGE_LENGTH) throw std::runtime_error(message);
  }
};

class UniqueHandle {
public:
  explicit UniqueHandle(HANDLE handle) : _handle(handle) {}

  ~UniqueHandle() {
    if (isValid()) CloseHandle(_handle);
  }

  UniqueHandle(const UniqueHandle&) = delete;
  UniqueHandle& operator=(const UniqueHandle&) = delete;

  HANDLE get() const { return _handle; }

private:
  bool isValid() const { return _handle != nullptr && _handle != INVALID_HANDLE_VALUE; }

  HANDLE _handle;
};

class NamedPipeClient {
public:
  explicit NamedPipeClient(const std::wstring& path) : _handle(openPipe(path)) {}

  NamedPipeClient(const NamedPipeClient&) = delete;
  NamedPipeClient& operator=(const NamedPipeClient&) = delete;

  std::vector<std::uint8_t> exchange(const std::vector<std::uint8_t>& request) const {
    writeAll(request);
    std::vector<std::uint8_t> response(CliProtocol::RESPONSE_HEADER_LENGTH);
    readExact(response.data(), response.size());
    const std::size_t headerLength = response.size();
    response.resize(CliProtocol::responseFrameLength(response));
    readExact(response.data() + headerLength, response.size() - headerLength);
    return response;
  }

private:
  static HANDLE openPipe(const std::wstring& path) {
    const HANDLE handle = CreateFileW(
      path.c_str(),
      GENERIC_READ | GENERIC_WRITE,
      0,
      nullptr,
      OPEN_EXISTING,
      FILE_FLAG_OVERLAPPED,
      nullptr
    );
    if (handle == INVALID_HANDLE_VALUE) {
      throwWindowsError("Could not connect to the running MagicHat instance", GetLastError());
    }
    return handle;
  }

  void writeAll(const std::vector<std::uint8_t>& data) const {
    std::size_t offset = 0;
    while (offset < data.size()) {
      const DWORD written = writeSome(data.data() + offset, data.size() - offset);
      if (written == 0) throw std::runtime_error("MagicHat closed the CLI Bridge while receiving a request");
      offset += written;
    }
  }

  void readExact(std::uint8_t* target, std::size_t length) const {
    std::size_t offset = 0;
    while (offset < length) {
      const DWORD read = readSome(target + offset, length - offset);
      if (read == 0) throw std::runtime_error("MagicHat closed the CLI Bridge without a complete response");
      offset += read;
    }
  }

  DWORD readSome(std::uint8_t* target, std::size_t length) const {
    UniqueHandle event(createEvent());
    OVERLAPPED overlapped{};
    overlapped.hEvent = event.get();
    DWORD transferred = 0;
    const BOOL completed = ReadFile(
      _handle.get(),
      target,
      checkedDword(length, "CLI Bridge read is too large"),
      &transferred,
      &overlapped
    );
    const DWORD startError = completed ? ERROR_SUCCESS : GetLastError();
    return completeIo(overlapped, completed, startError, transferred, true);
  }

  DWORD writeSome(const std::uint8_t* source, std::size_t length) const {
    UniqueHandle event(createEvent());
    OVERLAPPED overlapped{};
    overlapped.hEvent = event.get();
    DWORD transferred = 0;
    const BOOL completed = WriteFile(
      _handle.get(),
      source,
      checkedDword(length, "CLI Bridge write is too large"),
      &transferred,
      &overlapped
    );
    const DWORD startError = completed ? ERROR_SUCCESS : GetLastError();
    return completeIo(overlapped, completed, startError, transferred, false);
  }

  DWORD completeIo(
    OVERLAPPED& overlapped,
    BOOL completed,
    DWORD startError,
    DWORD transferred,
    bool isRead
  ) const {
    if (!completed && startError != ERROR_IO_PENDING) {
      throwWindowsError(
        isRead ? "Failed to read CLI Bridge response" : "Failed to send CLI Bridge request",
        startError
      );
    }
    if (!completed) {
      const DWORD waitResult = WaitForSingleObject(overlapped.hEvent, IO_TIMEOUT_MS);
      if (waitResult != WAIT_OBJECT_0) {
        const DWORD waitError = GetLastError();
        CancelIoEx(_handle.get(), &overlapped);
        GetOverlappedResult(_handle.get(), &overlapped, &transferred, TRUE);
        if (waitResult == WAIT_TIMEOUT) throw std::runtime_error("CLI Bridge request timed out");
        throwWindowsError("Failed while waiting for CLI Bridge I/O", waitError);
      }
      if (!GetOverlappedResult(_handle.get(), &overlapped, &transferred, FALSE)) {
        const DWORD error = GetLastError();
        throwWindowsError(isRead ? "Failed to read CLI Bridge response" : "Failed to send CLI Bridge request", error);
      }
    }
    return transferred;
  }

  static HANDLE createEvent() {
    const HANDLE event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (event == nullptr) throwWindowsError("Failed to create CLI Bridge I/O event", GetLastError());
    return event;
  }

  [[noreturn]] static void throwWindowsError(const char* operation, DWORD error) {
    throw std::runtime_error(std::string(operation) + " (Windows error " + std::to_string(error) + ")");
  }

  static constexpr DWORD IO_TIMEOUT_MS = 30'000;
  UniqueHandle _handle;
};

class CliApplication {
public:
  int run(int argumentCount, wchar_t* arguments[]) const {
    try {
      NamedPipeClient pipe(readEnvironment(PIPE_PATH_ENVIRONMENT_KEY));
      const auto request = CliProtocol::encodeRequest(
        argumentCount,
        arguments,
        EnvironmentStrings().getCliVariables()
      );
      const CliResponse response = CliProtocol::decodeResponse(pipe.exchange(request));
      if (!response.successful) throw std::runtime_error(response.message);
      std::cout << response.message << '\n';
      return 0;
    } catch (const std::exception& error) {
      std::cerr << error.what() << '\n';
      return 1;
    } catch (...) {
      std::cerr << "Unknown CLI error\n";
      return 1;
    }
  }
};

} // namespace

int wmain(int argumentCount, wchar_t* arguments[]) {
  return CliApplication().run(argumentCount, arguments);
}
