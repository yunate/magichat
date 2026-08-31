# 使用固定的 -File 入口保留含空格路径. -Command 会将后续内容重新作为
# PowerShell 命令文本解析, 使 C:\Program Files\... 一类路径可能被拆分.
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateNotNullOrEmpty()]
  [string] $Path
)

$ErrorActionPreference = "Stop"
Import-Module -Name (Join-Path $PSScriptRoot "MagicHat.psm1")
& $Path
exit $LASTEXITCODE