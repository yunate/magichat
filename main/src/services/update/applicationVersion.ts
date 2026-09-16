const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
const MAX_VERSION_COMPONENT = 0xffff_ffff;

export class ApplicationVersion {
  public static parse(value: string): ApplicationVersion {
    const match = VERSION_PATTERN.exec(value);
    if (match === null) {
      throw new Error("Application version must contain four numeric components.");
    }
    const components = match.slice(1).map((component) => Number(component));
    if (components.some((component) => !Number.isSafeInteger(component)
      || component > MAX_VERSION_COMPONENT)) {
      throw new Error("Application version component is out of range.");
    }
    return new ApplicationVersion(value, components);
  }

  public compare(other: ApplicationVersion): number {
    for (let index = 0; index < this._components.length; index += 1) {
      const difference = this._components[index] - other._components[index];
      if (difference !== 0) return difference;
    }
    return 0;
  }

  public equals(other: ApplicationVersion): boolean {
    return this.compare(other) === 0;
  }

  public toString(): string {
    return this._text;
  }

  private constructor(text: string, components: number[]) {
    this._text = text;
    this._components = components;
  }

  private readonly _text: string;
  private readonly _components: number[];
}