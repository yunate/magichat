import { readonly, ref, type Ref } from "vue";
import {
  COMMAND_CONFIG_KEY,
  commandConfigSerializer,
  type TerminalPlacement,
} from "../../../../../../common/config/command";
import { gMainApplication } from "../../main";

export type { TerminalPlacement } from "../../../../../../common/config/command";

class CommandSettings {
  public get isInitialized(): Readonly<Ref<boolean>> {
    return readonly(this._isInitialized);
  }

  public get terminalPlacement(): Readonly<Ref<TerminalPlacement>> {
    return readonly(this._terminalPlacement);
  }

  public async initialize(): Promise<void> {
    if (this._isInitialized.value) return;
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    const configJson = await configRpcObject.getJson(COMMAND_CONFIG_KEY);
    const config = commandConfigSerializer.fromJson(configJson);
    this._terminalPlacement.value = config.terminalPlacement;
    this._isInitialized.value = true;
  }

  public async setTerminalPlacement(value: TerminalPlacement): Promise<void> {
    if (!this._isInitialized.value) throw new Error("Command settings are not initialized");
    const configRpcObject = await gMainApplication.window.getConfigServerRpcObject();
    await configRpcObject.setJson(
      COMMAND_CONFIG_KEY,
      commandConfigSerializer.toJson({ terminalPlacement: value }),
    );
    this._terminalPlacement.value = value;
  }

  private readonly _isInitialized = ref(false);
  private readonly _terminalPlacement = ref<TerminalPlacement>("right");
}

export const gCommandSettings = new CommandSettings();
