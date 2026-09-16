import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Config, Context, Data, Effect, Layer, Redacted } from "effect"
import { readFile } from "node:fs/promises"

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly key: string
  readonly cause: unknown
}> {}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
}

export class Storage extends Context.Tag("Storage")<
  Storage,
  {
    /** Envoie l'objet s'il est absent. Une seconde ingestion ne réenvoie rien. */
    readonly putIfAbsent: (
      key: string,
      file: string,
      extension: string
    ) => Effect.Effect<boolean, StorageError>
  }
>() {}

export const StorageLive = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const bucket = yield* Config.string("S3_BUCKET")
    const client = new S3Client({
      endpoint: yield* Config.string("S3_ENDPOINT"),
      region: yield* Config.string("S3_REGION"),
      credentials: {
        accessKeyId: yield* Config.string("S3_ACCESS_KEY_ID"),
        secretAccessKey: Redacted.value(yield* Config.redacted("S3_SECRET_ACCESS_KEY")),
      },
      forcePathStyle: true,
    })

    return {
      putIfAbsent: (key, file, extension) =>
        Effect.tryPromise({
          try: async () => {
            try {
              await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
              return false
            } catch {
              await client.send(
                new PutObjectCommand({
                  Bucket: bucket,
                  Key: key,
                  Body: await readFile(file),
                  ContentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
                })
              )
              return true
            }
          },
          catch: (cause) => new StorageError({ key, cause }),
        }),
    }
  })
)
