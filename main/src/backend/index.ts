import { parseBackendBridgeConnectAccept } from "../../../common/ipc_bridge/messagePortProtocol";
import { Backend } from "./backend";

const parentPort = process.parentPort;
if (parentPort === null || parentPort === undefined) {
  throw new Error("Backend must be started as an Electron utility process");
}
const backend = new Backend();
parentPort.on("message", (event) => {
  const connection = parseBackendBridgeConnectAccept(event.data);
  const [port] = event.ports;
  if (event.ports.length !== 1 || port === undefined) {
    throw new Error("Backend connection requires one MessagePort");
  }
  backend.connect(port, connection);
});