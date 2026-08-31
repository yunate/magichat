function Invoke-MagicHatCommand {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string] $Path
  )

  if ([string]::IsNullOrWhiteSpace($env:MAGICHAT_CLI)) {
    throw "MAGICHAT_CLI is not configured."
  }

  [string[]] $preparedRuns = @(& $env:MAGICHAT_CLI prepare $Path 2>&1)
  [int] $preparationExitCode = $LASTEXITCODE
  if ($preparationExitCode -ne 0) {
    [string] $failureDetail = ($preparedRuns -join [Environment]::NewLine).Trim()
    if ($failureDetail.Length -gt 0) {
      throw "MagicHat command preparation failed: $failureDetail"
    }
    throw "MagicHat command preparation failed with exit code $preparationExitCode."
  }
  if ($preparedRuns.Count -ne 1) {
    throw "MagicHat command preparation returned an invalid run description."
  }

  $firstSeparatorIndex = $preparedRuns[0].IndexOf("|")
  $secondSeparatorIndex = $preparedRuns[0].IndexOf("|", $firstSeparatorIndex + 1)
  if ($firstSeparatorIndex -le 0 -or $secondSeparatorIndex -le $firstSeparatorIndex + 1 -or $secondSeparatorIndex -eq $preparedRuns[0].Length - 1) {
    throw "MagicHat command preparation returned an invalid run description."
  }
  $scriptType = $preparedRuns[0].Substring(0, $firstSeparatorIndex)
  $scriptPath = $preparedRuns[0].Substring($firstSeparatorIndex + 1, $secondSeparatorIndex - $firstSeparatorIndex - 1)
  $commandPath = $preparedRuns[0].Substring($secondSeparatorIndex + 1)
  Invoke-MagicHatRun $scriptType $scriptPath $commandPath
}

function Invoke-MagicHatRun {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("powershell", "node", "python", "cmd")]
    [string] $ScriptType,

    [Parameter(Mandatory = $true, Position = 1)]
    [ValidateNotNullOrEmpty()]
    [string] $Path,

    [Parameter(Mandatory = $true, Position = 2)]
    [ValidateNotNullOrEmpty()]
    [string] $CommandPath
  )

  $previousCommandPath = $env:MAGICHAT_CLI_COMMAND_PATH
  try {
    $env:MAGICHAT_CLI_COMMAND_PATH = $CommandPath
    switch ($ScriptType) {
      "powershell" { & $Path }
      "node" { & node $Path }
      "python" { & python $Path }
      "cmd" { & cmd.exe /c $Path }
    }
  }
  finally {
    $env:MAGICHAT_CLI_COMMAND_PATH = $previousCommandPath
    function global:prompt {
      "PS $($executionContext.SessionState.Path.CurrentLocation)$(">" * ($nestedPromptLevel + 1)) "
    }
  }
}

function Set-MagicHatEnvironment {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  if ([string]::IsNullOrWhiteSpace($env:MAGICHAT_CLI)) {
    throw "MAGICHAT_CLI is not configured."
  }

  & $env:MAGICHAT_CLI set-env @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "MagicHat environment update failed with exit code $LASTEXITCODE."
  }
}

function Set-MagicHatTaskState {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string] $Text
  )

  if ([string]::IsNullOrWhiteSpace($env:MAGICHAT_CLI)) {
    throw "MAGICHAT_CLI is not configured."
  }

  & $env:MAGICHAT_CLI set-task-state $Text
  if ($LASTEXITCODE -ne 0) {
    throw "MagicHat task state update failed with exit code $LASTEXITCODE."
  }
}

function Clear-MagicHatTaskState {
  [CmdletBinding()]
  param()

  if ([string]::IsNullOrWhiteSpace($env:MAGICHAT_CLI)) {
    throw "MAGICHAT_CLI is not configured."
  }

  & $env:MAGICHAT_CLI clear-task-state
  if ($LASTEXITCODE -ne 0) {
    throw "MagicHat task state clear failed with exit code $LASTEXITCODE."
  }
}

Set-Alias -Name mhcall -Value Invoke-MagicHatCommand -Scope Script
Set-Alias -Name mhrun -Value Invoke-MagicHatRun -Scope Script
Set-Alias -Name mhsetenv -Value Set-MagicHatEnvironment -Scope Script
Set-Alias -Name mhsettaskstate -Value Set-MagicHatTaskState -Scope Script
Set-Alias -Name mhcleartaskstate -Value Clear-MagicHatTaskState -Scope Script

Export-ModuleMember -Function Invoke-MagicHatCommand, Invoke-MagicHatRun, Set-MagicHatEnvironment, Set-MagicHatTaskState, Clear-MagicHatTaskState -Alias mhcall, mhrun, mhsetenv, mhsettaskstate, mhcleartaskstate
