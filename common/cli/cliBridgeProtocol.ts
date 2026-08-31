import { createHash } from "node:crypto";
import path from "node:path";

export type CliEnvironmentVariable = Readonly<{
  key: string;
  value: string;
}>;

export type CliBridgeRequest = Readonly<{
  environment: readonly CliEnvironmentVariable[];
  arguments: readonly string[];
}>;

export type CliBridgeResponse = Readonly<{
  successful: true;
  response: string;
}> | Readonly<{
  successful: false;
  error: string;
}>;

export const CLI_BRIDGE_MESSAGE_MAX_LENGTH = 64 * 1024;
export const CLI_BRIDGE_PIPE_PATH_ENVIRONMENT_KEY = "MAGICHAT_CLI_PIPE";
export const CLI_PATH_ENVIRONMENT_KEY = "MAGICHAT_CLI";
export const CLI_NODE_HELPER_PATH_ENVIRONMENT_KEY = "MAGICHAT_CLI_NODE_HELPER";
export const CLI_TERMINAL_ID_ENVIRONMENT_KEY = "MAGICHAT_CLI_TERMINAL_ID";
export const CLI_COMMAND_PATH_ENVIRONMENT_KEY = "MAGICHAT_CLI_COMMAND_PATH";
export const CLI_PAGE_ENVIRONMENT_KEY = "MAGICHAT_CLI_PAGE";
export const CLI_TASK_ID_ENVIRONMENT_KEY = "MAGICHAT_CLI_TASK_ID";
export const CLI_PAGE_COMMAND = "command";
export const CLI_PAGE_TASK_CENTER = "task-center";
const CLI_ENVIRONMENT_KEY_PREFIX = "MAGICHAT_CLI";
const REQUEST_MAGIC = Buffer.from("MHC3", "ascii");
const RESPONSE_MAGIC = Buffer.from("MHR1", "ascii");
const REQUEST_HEADER_LENGTH = 12;
const RESPONSE_HEADER_LENGTH = 9;

export function getCliBridgePipePath(instanceScope: string): string {
  const scopeId = createHash("sha256").update(instanceScope).digest("hex").slice(0, 16);
  return process.platform === "win32"
    ? String.raw`\\.\pipe\magichat-cli-${scopeId}`
    : path.join(process.env.TMPDIR ?? "/tmp", `magichat-cli-${scopeId}.sock`);
}

export function decodeCliBridgeRequest(data: Buffer): CliBridgeRequest | null {
  if (data.length > CLI_BRIDGE_MESSAGE_MAX_LENGTH) throw new Error("CLI Bridge request is too large");
  if (data.length < REQUEST_HEADER_LENGTH) return null;
  if (!data.subarray(0, REQUEST_MAGIC.length).equals(REQUEST_MAGIC)) {
    throw new Error("CLI Bridge request protocol is invalid");
  }
  const environmentCount = data.readUInt32LE(REQUEST_MAGIC.length);
  const argumentCount = data.readUInt32LE(REQUEST_MAGIC.length + 4);
  if (environmentCount > Math.floor(CLI_BRIDGE_MESSAGE_MAX_LENGTH / 8)) {
    throw new Error("CLI Bridge environment count is invalid");
  }
  if (argumentCount > Math.floor(CLI_BRIDGE_MESSAGE_MAX_LENGTH / 4)) {
    throw new Error("CLI Bridge argument count is invalid");
  }
  const environment: CliEnvironmentVariable[] = [];
  let offset = REQUEST_HEADER_LENGTH;
  for (let index = 0; index < environmentCount; index += 1) {
    const keyResult = decodeString(data, offset, "CLI Bridge environment key");
    if (keyResult === null) return null;
    offset = keyResult.nextOffset;
    const valueResult = decodeString(data, offset, "CLI Bridge environment value");
    if (valueResult === null) return null;
    offset = valueResult.nextOffset;
    if (keyResult.value.length === 0) throw new Error("CLI Bridge environment key is empty");
    if (!keyResult.value.toUpperCase().startsWith(CLI_ENVIRONMENT_KEY_PREFIX)) {
      throw new Error("CLI Bridge environment key is invalid");
    }
    environment.push({ key: keyResult.value, value: valueResult.value });
  }
  const arguments_: string[] = [];
  for (let index = 0; index < argumentCount; index += 1) {
    const result = decodeString(data, offset, "CLI Bridge argument");
    if (result === null) return null;
    arguments_.push(result.value);
    offset = result.nextOffset;
  }
  if (offset !== data.length) throw new Error("CLI Bridge request has trailing data");
  return { environment, arguments: arguments_ };
}

export function encodeCliBridgeResponse(response: CliBridgeResponse): Buffer {
  const message = Buffer.from(response.successful ? response.response : response.error, "utf8");
  const result = Buffer.allocUnsafe(RESPONSE_HEADER_LENGTH + message.length);
  if (result.length > CLI_BRIDGE_MESSAGE_MAX_LENGTH) throw new Error("CLI Bridge response is too large");
  RESPONSE_MAGIC.copy(result, 0);
  result.writeUInt8(response.successful ? 1 : 0, RESPONSE_MAGIC.length);
  result.writeUInt32LE(message.length, RESPONSE_MAGIC.length + 1);
  message.copy(result, RESPONSE_HEADER_LENGTH);
  return result;
}

function decodeUtf8(data: Buffer, description: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new Error(`${description} must be valid UTF-8`);
  }
}

function decodeString(
  data: Buffer,
  offset: number,
  description: string,
): Readonly<{ value: string; nextOffset: number }> | null {
  if (data.length - offset < 4) return null;
  const length = data.readUInt32LE(offset);
  const valueOffset = offset + 4;
  if (length > CLI_BRIDGE_MESSAGE_MAX_LENGTH || data.length - valueOffset < length) return null;
  const nextOffset = valueOffset + length;
  return { value: decodeUtf8(data.subarray(valueOffset, nextOffset), description), nextOffset };
}