#include <windows.h>
#include <shellapi.h>
#include <tlhelp32.h>

#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace {

class Handle {
public:
  explicit Handle(HANDLE value) : _value(value) {}
  ~Handle() {
    if (_value != nullptr && _value != INVALID_HANDLE_VALUE) CloseHandle(_value);
  }

  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;

  HANDLE get() const { return _value; }

private:
  HANDLE _value;
};

std::wstring quoteArgument(std::wstring_view value) {
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

std::wstring createArguments(int argumentCount, wchar_t* arguments[]) {
  std::wstring result = quoteArgument(arguments[1]);
  for (int index = 3; index < argumentCount; ++index) {
    result.push_back(L' ');
    result.append(quoteArgument(arguments[index]));
  }
  if (result.size() > 32'767) throw std::runtime_error("JavaScript parameters are too long");
  return result;
}

std::wstring createElevatedArguments(
  const std::wstring& executablePath,
  int argumentCount,
  wchar_t* arguments[]
) {
  std::wstring result = L"--elevated ";
  result.append(quoteArgument(executablePath));
  for (int index = 1; index < argumentCount; ++index) {
    result.push_back(L' ');
    result.append(quoteArgument(arguments[index]));
  }
  if (result.size() > 32'767) throw std::runtime_error("JavaScript parameters are too long");
  return result;
}

std::wstring getCurrentExecutablePath() {
  std::wstring result(32'768, L'\0');
  const DWORD length = GetModuleFileNameW(
    nullptr,
    result.data(),
    static_cast<DWORD>(result.size())
  );
  if (length == 0 || length == result.size()) {
    throw std::runtime_error("Failed to resolve launcher executable");
  }
  result.resize(length);
  return result;
}

std::wstring getParentExecutablePath() {
  const Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
  if (snapshot.get() == INVALID_HANDLE_VALUE) {
    throw std::runtime_error("Failed to inspect parent process");
  }
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  if (!Process32FirstW(snapshot.get(), &entry)) {
    throw std::runtime_error("Failed to inspect parent process");
  }
  const DWORD currentProcessId = GetCurrentProcessId();
  DWORD parentProcessId = 0;
  do {
    if (entry.th32ProcessID == currentProcessId) {
      parentProcessId = entry.th32ParentProcessID;
      break;
    }
  } while (Process32NextW(snapshot.get(), &entry));
  if (parentProcessId == 0) throw std::runtime_error("Failed to resolve parent process");

  const Handle parentProcess(
    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, parentProcessId)
  );
  if (parentProcess.get() == nullptr) throw std::runtime_error("Failed to open parent process");
  std::wstring result(32'768, L'\0');
  DWORD length = static_cast<DWORD>(result.size());
  if (!QueryFullProcessImageNameW(parentProcess.get(), 0, result.data(), &length)) {
    throw std::runtime_error("Failed to resolve JavaScript host executable");
  }
  result.resize(length);
  return result;
}

DWORD launch(const std::wstring& executablePath, const std::wstring& parameters) {
  std::wstring commandLine = quoteArgument(executablePath) + L" " + parameters;
  STARTUPINFOW startupInfo{};
  startupInfo.cb = sizeof(startupInfo);
  startupInfo.dwFlags = STARTF_USESHOWWINDOW;
  startupInfo.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION processInfo{};
  if (!CreateProcessW(
    executablePath.c_str(), commandLine.data(), nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
    nullptr, nullptr, &startupInfo, &processInfo
  )) {
    throw std::runtime_error("Failed to start JavaScript process: "
      + std::to_string(GetLastError()));
  }
  const Handle thread(processInfo.hThread);
  const Handle process(processInfo.hProcess);
  return processInfo.dwProcessId;
}

DWORD runas(const std::wstring& parameters) {
  const std::wstring launcherPath = getCurrentExecutablePath();
  SHELLEXECUTEINFOW executeInfo{};
  executeInfo.cbSize = sizeof(executeInfo);
  executeInfo.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
  executeInfo.lpVerb = L"runas";
  executeInfo.lpFile = launcherPath.c_str();
  executeInfo.lpParameters = parameters.c_str();
  executeInfo.nShow = SW_HIDE;
  if (!ShellExecuteExW(&executeInfo)) {
    throw std::runtime_error("Failed to elevate JavaScript launcher: "
      + std::to_string(GetLastError()));
  }
  const Handle process(executeInfo.hProcess);
  if (WaitForSingleObject(process.get(), INFINITE) != WAIT_OBJECT_0) {
    throw std::runtime_error("Failed to wait for elevated JavaScript launcher: "
      + std::to_string(GetLastError()));
  }
  DWORD processId = 0;
  if (!GetExitCodeProcess(process.get(), &processId) || processId == 0) {
    throw std::runtime_error("Elevated JavaScript launcher failed");
  }
  return processId;
}

} // namespace

int wmain(int argumentCount, wchar_t* arguments[]) {
  const bool isElevated = argumentCount >= 2
    && std::wstring_view(arguments[1]) == L"--elevated";
  try {
    if (isElevated) {
      if (argumentCount < 5) throw std::runtime_error("Elevated launcher arguments are invalid");
      if (!SetEnvironmentVariableW(L"ELECTRON_RUN_AS_NODE", L"1")) {
        throw std::runtime_error("Failed to configure JavaScript host environment");
      }
      std::wstring parameters = quoteArgument(arguments[3]);
      for (int index = 5; index < argumentCount; ++index) {
        parameters.push_back(L' ');
        parameters.append(quoteArgument(arguments[index]));
      }
      return static_cast<int>(launch(arguments[2], parameters));
    }
    if (argumentCount < 3) {
      throw std::runtime_error("Usage: js-launcher <js-path> <runas> [parameters...]");
    }
    const std::wstring runasValue(arguments[2]);
    if (runasValue != L"true" && runasValue != L"false") {
      throw std::runtime_error("runas must be true or false");
    }
    const std::wstring executablePath = getParentExecutablePath();
    DWORD processId = 0;
    if (runasValue == L"true") {
      processId = runas(
        createElevatedArguments(executablePath, argumentCount, arguments)
      );
    } else {
      if (!SetEnvironmentVariableW(L"ELECTRON_RUN_AS_NODE", L"1")) {
        throw std::runtime_error("Failed to configure JavaScript host environment");
      }
      processId = launch(executablePath, createArguments(argumentCount, arguments));
    }
    std::wcout << processId;
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return isElevated ? 0 : 1;
  }
}