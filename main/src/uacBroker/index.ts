import net from "node:net";
import { UacBroker } from "./uacBroker";

type BrokerArguments = Readonly<{
  pipeName: string;
  mainProcessId: number;
  token: string;
  nativeToolsPath: string;
}>;

function parseArguments(arguments_: readonly string[]): BrokerArguments {
  if (arguments_.length !== 8
    || arguments_[0] !== "--pipe-name"
    || arguments_[2] !== "--main-pid"
    || arguments_[4] !== "--token"
    || arguments_[6] !== "--native-tools-path") {
    throw new Error("UAC Broker arguments are invalid");
  }
  const pipeName = arguments_[1];
  const mainProcessId = Number(arguments_[3]);
  const token = arguments_[5];
  const nativeToolsPath = arguments_[7];
  if (!/^magichat-uac-[0-9]+-[a-f0-9]{32}$/.test(pipeName)) {
    throw new Error("UAC Broker pipe name is invalid");
  }
  if (!Number.isSafeInteger(mainProcessId) || mainProcessId <= 0 || mainProcessId > 0xffff_ffff) {
    throw new Error("UAC Broker main process ID is invalid");
  }
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error("UAC Broker token is invalid");
  if (nativeToolsPath.length === 0 || nativeToolsPath.includes("\0")) {
    throw new Error("UAC Broker native tools path is invalid");
  }
  return { pipeName, mainProcessId, token, nativeToolsPath };
}

function startBroker(arguments_: BrokerArguments): void {
  const socket = net.createConnection(`\\\\.\\pipe\\${arguments_.pipeName}`);
  new UacBroker(
    socket,
    arguments_.mainProcessId,
    arguments_.token,
    arguments_.nativeToolsPath,
  );
}

try {
  startBroker(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}