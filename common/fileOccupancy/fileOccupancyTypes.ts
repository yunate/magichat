export type FileOccupyingProcess = Readonly<{
  pid: number;
  name: string;
  targetPath: string;
  executablePath: string | null;
  commandLine: string | null;
  owner: string | null;
  sessionId: number | null;
  startedAt: string | null;
}>;

export type FileOccupancyQueryResult =
  | Readonly<{ status: "completed"; processes: readonly FileOccupyingProcess[] }>
  | Readonly<{ status: "canceled" }>;

export type ProcessIdentity = Readonly<{
  pid: number;
  targetPath: string;
  startedAt: string;
  executablePath: string;
}>;

export type TerminateProcessTreeResult =
  | Readonly<{ status: "terminated" }>
  | Readonly<{ status: "alreadyExited" }>
  | Readonly<{ status: "stale" }>;