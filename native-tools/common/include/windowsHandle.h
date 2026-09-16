#pragma once

#define NOMINMAX
#include <windows.h>

namespace magichat::native {

class UniqueHandle {
public:
  explicit UniqueHandle(HANDLE value) : _value(value) {}

  ~UniqueHandle() {
    close();
  }

  UniqueHandle(const UniqueHandle&) = delete;
  UniqueHandle& operator=(const UniqueHandle&) = delete;

  HANDLE get() const { return _value; }

  void close() {
    if (_value == nullptr || _value == INVALID_HANDLE_VALUE) return;
    CloseHandle(_value);
    _value = nullptr;
  }

private:
  HANDLE _value;
};

class UniqueFindHandle {
public:
  explicit UniqueFindHandle(HANDLE value) : _value(value) {}

  ~UniqueFindHandle() {
    if (_value != INVALID_HANDLE_VALUE) FindClose(_value);
  }

  UniqueFindHandle(const UniqueFindHandle&) = delete;
  UniqueFindHandle& operator=(const UniqueFindHandle&) = delete;

private:
  HANDLE _value;
};

} // namespace magichat::native