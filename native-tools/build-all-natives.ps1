param(
  [string] $ManifestPath = (Join-Path $PSScriptRoot "native-projects.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-NativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string] $RelativePath
  )

  if ([string]::IsNullOrWhiteSpace($RelativePath)) {
    throw "Native project path must not be blank."
  }

  $fullPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $RelativePath))
  $nativeRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd("\")
  $nativePrefix = "$nativeRoot\"
  if (-not $fullPath.StartsWith($nativePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Native project path escapes native-tools: $RelativePath"
  }
  return $fullPath
}

function Get-Sha256Hash {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Path
  )

  $stream = [IO.File]::OpenRead($Path)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Get-SourceHash {
  param(
    [Parameter(Mandatory = $true)]
    [object[]] $InputPaths
  )

  $files = foreach ($inputPathValue in $InputPaths) {
    if (-not ($inputPathValue -is [string])) {
      throw "Native project input path must be a string."
    }
    $inputPath = Resolve-NativePath $inputPathValue
    if (-not (Test-Path -LiteralPath $inputPath)) {
      throw "Native project input does not exist: $inputPathValue"
    }
    if (Test-Path -LiteralPath $inputPath -PathType Container) {
      Get-ChildItem -LiteralPath $inputPath -Recurse -File
    } else {
      Get-Item -LiteralPath $inputPath
    }
  }

  $nativeRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd("\")
  $entries = $files |
    Sort-Object -Property FullName -Unique |
    ForEach-Object {
      $relativePath = $_.FullName.Substring($nativeRoot.Length + 1).Replace("\", "/")
      $fileHash = Get-Sha256Hash $_.FullName
      "$relativePath|$fileHash"
    }
  $content = [Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha256.ComputeHash($content))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

function Get-TargetHash {
  param(
    [Parameter(Mandatory = $true)]
    [string] $TargetPath
  )

  return Get-Sha256Hash $TargetPath
}

function Save-Manifest {
  param(
    [Parameter(Mandatory = $true)]
    [object] $Manifest
  )

  $temporaryPath = "$ManifestPath.tmp"
  $json = $Manifest | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText(
    $temporaryPath,
    "$json`n",
    (New-Object Text.UTF8Encoding($false))
  )
  Move-Item -LiteralPath $temporaryPath -Destination $ManifestPath -Force
}

try {
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "Native project manifest does not exist: $ManifestPath"
  }
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.version -ne 1 -or $null -eq $manifest.projects) {
    throw "Native project manifest is invalid."
  }

  foreach ($project in $manifest.projects) {
    if ([string]::IsNullOrWhiteSpace([string] $project.name)) {
      throw "Native project name must not be blank."
    }
    $buildScript = Resolve-NativePath ([string] $project.buildScript)
    $targetExecutable = Resolve-NativePath ([string] $project.targetExecutable)
    if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) {
      throw "Native build script does not exist: $($project.buildScript)"
    }

    $sourceHash = Get-SourceHash $project.inputPaths
    $targetExists = Test-Path -LiteralPath $targetExecutable -PathType Leaf
    $targetHash = if ($targetExists) { Get-TargetHash $targetExecutable } else { "" }
    $isCurrent = $targetExists `
      -and $sourceHash -eq [string] $project.sourceHash `
      -and $targetHash -eq [string] $project.targetHash
    if ($isCurrent) {
      Write-Host "[native] $($project.name) is current; skipping."
      continue
    }

    Write-Host "[native] Building $($project.name)..."
    $global:LASTEXITCODE = 0
    & $buildScript
    if ($LASTEXITCODE -ne 0) {
      throw "Native build failed for $($project.name) with exit code $LASTEXITCODE."
    }
    if (-not (Test-Path -LiteralPath $targetExecutable -PathType Leaf)) {
      throw "Native build did not create target: $($project.targetExecutable)"
    }

    $completedSourceHash = Get-SourceHash $project.inputPaths
    if ($completedSourceHash -ne $sourceHash) {
      throw "Native sources changed while building $($project.name)."
    }
    $project.sourceHash = $completedSourceHash
    $project.targetHash = Get-TargetHash $targetExecutable
    Save-Manifest $manifest
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
