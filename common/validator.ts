export class ValidateUtils {
  static is(assertFn: (value: unknown) => void, value: unknown): boolean {
    try {
      assertFn(value);
      return true;
    } catch {
      return false;
    }
  }

  static ensureRecord(value: unknown): asserts value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) throw new Error("请求参数无效");
  }

  static ensureBoolean(value: unknown, message = "请求参数无效"): asserts value is boolean {
    if (typeof value !== "boolean") throw new Error(message);
  }

  static ensureString(value: unknown, message = "请求参数无效"): asserts value is string {
    if (typeof value !== "string") throw new Error(message);
  }

  static ensureNonEmptyString(value: unknown, message: string): asserts value is string {
    if (typeof value !== "string" || value.length === 0) throw new Error(message);
  }

  static ensureNonBlankString(value: unknown, message = "请求参数无效"): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
  }

  static ensureNumber(value: unknown, message = "请求参数无效"): asserts value is number {
    if (typeof value !== "number" || Number.isNaN(value)) throw new Error(message);
  }

  static ensureArray(value: unknown, message = "参数必须是数组"): asserts value is unknown[] {
    if (!Array.isArray(value)) throw new Error(message);
  }
}
