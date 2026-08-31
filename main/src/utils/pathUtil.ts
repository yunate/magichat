import fs from "node:fs";
import path from "node:path";

export class PathUtil {
  public static resolve(targetPath: string): string {
    return path.resolve(targetPath);
  }

  public static ensureFileExist(filePath: string): void {
    const stats = fs.statSync(filePath, { throwIfNoEntry: false });
    if (!stats?.isFile()) throw new Error("File does not exist");
  }

  public static ensureFolderExist(folderPath: string): void {
    const stats = fs.statSync(folderPath, { throwIfNoEntry: false });
    if (!stats?.isDirectory()) throw new Error("Folder does not exist");
  }

  public static ensurePathExist(targetPath: string): void {
    if (!fs.existsSync(targetPath)) throw new Error("Path does not exist");
  }

  public static ensurePathNotExist(targetPath: string): void {
    if (fs.existsSync(targetPath)) throw new Error(`Path already exists: ${targetPath}`);
  }
}
