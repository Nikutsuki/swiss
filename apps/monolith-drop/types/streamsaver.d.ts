declare module "streamsaver" {
  export type CreateWriteStreamOptions = {
    size?: number | null;
    pathname?: string | null;
  };

  const streamSaver: {
    mitm: string;
    createWriteStream(
      filename: string,
      options?: CreateWriteStreamOptions,
    ): WritableStream<Uint8Array>;
  };

  export default streamSaver;
}
