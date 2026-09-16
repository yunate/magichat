import fs from "node:original-fs";
import path from "node:path";

export class PathUtil {
  public static resolve(targetPath: string): string {
    return path.resolve(targetPath);
  }

  public static ensureFileExist(filePath: string): void {
    if (!PathUtil.isFile(filePath)) throw new Error("File does not exist");
  }

  public static ensureFolderExist(folderPath: string): void {
    if (!PathUtil.isDirectory(folderPath)) throw new Error("Folder does not exist");
  }

  public static isFile(filePath: string): boolean {
    return fs.statSync(filePath, { throwIfNoEntry: false })?.isFile() ?? false;
  }

  public static isDirectory(directoryPath: string): boolean {
    return fs.statSync(directoryPath, { throwIfNoEntry: false })?.isDirectory() ?? false;
  }

  public static ensurePathExist(targetPath: string): void {
    if (!fs.existsSync(targetPath)) throw new Error("Path does not exist");
  }

  public static ensurePathNotExist(targetPath: string): void {
    if (fs.existsSync(targetPath)) throw new Error(`Path already exists: ${targetPath}`);
  }
}
