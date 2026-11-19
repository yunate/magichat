# Third-Party Notices

MagicHat includes the following third-party software.

The MIT license at the repository root applies to MagicHat's own code. It does
not replace the licenses of dependencies or grant a license to a separate
upstream repository. This document is not a completed release license audit;
the dependency inventory and required license copies must be checked before
claiming eligibility for sponsored code signing.

## ddwhouses and ddbase

- ddwhouses source: https://github.com/yunate/ddwhouses
- Source revision reviewed: `8a21ecfbf31fcac47805dfa98f1d2cacf6c79f06`.
- ddbase source: https://github.com/yunate/dd, under `projects/ddbase`.
- Dependency revision reviewed: `2b98dcb93d8d5db5fd221e8cc059d3b3bb7c5efb`.
- Bundled executable: `native-tools/ddwhouses/bin/ddwhouses.exe`.

ddwhouses provides the native file-handle enumeration used by File Occupancy.
Its project imports headers and libraries from the sibling dd repository.
The public source location alone does not establish a license or prove that
the previously bundled executable was built from these reviewed revisions.

As of 2026-11-19, the reviewed upstream repository roots do not contain a
project license. The upstream copyright holder must publish an explicit
license, including the applicable copyright notices, before these components
can be described as satisfying SignPath Foundation's open-source conditions.
The MagicHat MIT license must not be presented as that upstream authorization.

## Electron and node-pty

- Electron source and licensing information: https://github.com/electron/electron.
- node-pty source and licensing information: https://github.com/microsoft/node-pty.

Retain the upstream license notices distributed with Electron, Chromium,
node-pty, and their bundled dependencies. The release license review must also
cover renderer dependencies, fonts, and other redistributed assets. Upstream
binaries must not be re-signed as MagicHat-owned software without approval
under the applicable signing policy.

## Monaco Editor

Copyright (c) 2016 - present Microsoft Corporation

The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
does not apply to any document created using the Font Software.

## friendly-snippets

Source: https://github.com/rafamadriz/friendly-snippets

Bundled revision: b4d01b0fdf3c9a549961c2f9ffe8dc09be166219

MIT License

Copyright (c) 2021 Rafael Madriz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
