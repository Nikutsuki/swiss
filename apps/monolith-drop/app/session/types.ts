export type OutgoingTransferStatus = "queued" | "sending" | "done" | "error" | "cancelled";

export type IncomingTransferStatus = "receiving" | "done" | "error" | "cancelled";

export type TransferSession =
  | {
      id: string;
      direction: "out";
      name: string;
      progress: number;
      total: number;
      currentSpeedBps: number;
      averageSpeedBps: number;
      etaSeconds: number | null;
      status: OutgoingTransferStatus;
    }
  | {
      id: string;
      direction: "in";
      name: string;
      progress: number;
      total: number;
      currentSpeedBps: number;
      averageSpeedBps: number;
      etaSeconds: number | null;
      status: IncomingTransferStatus;
    };

/** Active and completed transfers keyed by stable transfer id. */
export type TransferMap = Map<string, TransferSession>;
