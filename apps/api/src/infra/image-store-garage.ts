import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { ImageStore, RepositoryError } from "../domain/repository.ts"

/** Garage est compatible S3 : le SDK AWS convient tel quel. */
export const ImageStoreLive = Layer.effect(
  ImageStore,
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
      get: (key) =>
        Effect.tryPromise({
          try: async () => {
            const object = await client.send(
              new GetObjectCommand({ Bucket: bucket, Key: key })
            )
            return Option.some({
              contentType: object.ContentType ?? "application/octet-stream",
              bytes: await object.Body!.transformToByteArray(),
              etag: object.ETag,
            })
          },
          catch: (cause) => cause,
        }).pipe(
          // Un objet absent n'est pas une panne : c'est un 404.
          Effect.catchAll((cause) =>
            (cause as { name?: string }).name === "NoSuchKey"
              ? Effect.succeedNone
              : new RepositoryError({ cause })
          )
        ),
    }
  })
)
