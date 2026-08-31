import os
import subprocess
from collections.abc import Mapping, Sequence
from pathlib import Path


POWERSHELL_SCRIPT_RUNNER_PATH = str(
    Path(__file__).parent.parent / "powershell" / "Invoke-MagicHatPowerShellScript.ps1"
)
SCRIPT_COMMANDS = {
    "powershell": (
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        POWERSHELL_SCRIPT_RUNNER_PATH,
    ),
    "node": ("node",),
    "python": ("python",),
    "cmd": ("cmd.exe", "/c"),
}


def mhcall(command_path: str) -> None:
    _ensure_non_blank_string(command_path, "Command path")
    description = _run_cli(
        ("prepare", command_path),
        "MagicHat command preparation",
        capture_output=True,
    ).strip()
    parts = description.split("|")
    if len(parts) != 3 or any(not part for part in parts):
        raise RuntimeError("MagicHat command preparation returned an invalid run description.")
    script_type, script_path, resolved_command_path = parts

    command = SCRIPT_COMMANDS.get(script_type)
    if command is None:
        raise RuntimeError(f"Unsupported script type: {script_type}")
    environment = os.environ.copy()
    environment["MAGICHAT_CLI_COMMAND_PATH"] = resolved_command_path
    _run((*command, script_path), f"MagicHat {script_type} command", environment=environment)


def mhsetenv(updates: Mapping[str, str], target_path: str | None = None) -> None:
    if not isinstance(updates, Mapping):
        raise TypeError("Environment updates must be a mapping.")
    if not updates:
        raise TypeError("Environment updates must not be empty.")

    arguments = ["set-env"]
    if target_path is not None:
        _ensure_non_blank_string(target_path, "Macro path")
        arguments.append(f"--path={target_path}")
    for key, value in updates.items():
        _ensure_non_blank_string(key, "Environment variable name")
        if not isinstance(value, str):
            raise TypeError(f"Environment variable {key} must be a string.")
        arguments.extend((key, value))
    _run_cli(arguments, "MagicHat environment update")


def mhsettaskstate(text: str) -> None:
    _ensure_non_blank_string(text, "Task state")
    _run_cli(("set-task-state", text), "MagicHat task state update")


def mhcleartaskstate() -> None:
    _run_cli(("clear-task-state",), "MagicHat task state clear")


def _run_cli(
    arguments: Sequence[str],
    description: str,
    *,
    capture_output: bool = False,
) -> str:
    cli_path = os.environ.get("MAGICHAT_CLI")
    _ensure_non_blank_string(cli_path, "MAGICHAT_CLI")
    return _run((cli_path, *arguments), description, capture_output=capture_output)


def _run(
    command: Sequence[str],
    description: str,
    *,
    capture_output: bool = False,
    environment: Mapping[str, str] | None = None,
) -> str:
    result = subprocess.run(
        command,
        check=False,
        stdout=subprocess.PIPE if capture_output else None,
        stderr=subprocess.PIPE if capture_output else None,
        text=True,
        encoding="utf-8",
        env=environment,
    )
    if result.returncode != 0:
        failure_detail = (result.stderr or "").strip()
        if failure_detail:
            raise RuntimeError(f"{description} failed: {failure_detail}")
        raise RuntimeError(f"{description} failed with exit code {result.returncode}.")
    return result.stdout or ""


def _ensure_non_blank_string(value: object, description: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise TypeError(f"{description} must be a non-blank string.")