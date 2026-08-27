export abstract class ISerializer<T> {
  public abstract getDefault(): T;

  public abstract validate(value: unknown): asserts value is T;

  public fromValue(value: unknown): T {
    this.validate(value);
    return value;
  }

  public fromJson(json: string): T {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new Error("Serialized value must be valid JSON");
    }
    return this.fromValue(value);
  }

  public toJson(value: T): string {
    const normalizedValue = this.fromValue(value);
    const json = JSON.stringify(normalizedValue);
    if (json === undefined) {
      throw new Error("Value could not be serialized to JSON");
    }
    return json;
  }
}

export type SerializerValue<Serializer> =
  Serializer extends ISerializer<infer Value> ? Value : never;
