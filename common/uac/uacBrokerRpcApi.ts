export type UacBrokerReadyInfo = Readonly<{
  processId: number;
  token: string;
}>;

export interface UacBrokerServerRpcApi {
  getReadyInfo(): UacBrokerReadyInfo;
  shutdown(): void;
}