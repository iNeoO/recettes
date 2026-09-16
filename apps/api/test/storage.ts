import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Effect } from "effect"

/** Un PNG 1×1 valide, assez petit pour être comparé octet par octet. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
)

const client = () =>
  new S3Client({
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION!,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  })

/** Dépose l'objet et le retire à la fin du test. */
export const putTestObject = (key: string) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      await client().send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: key,
          Body: PIXEL,
          ContentType: "image/png",
        })
      )
      return new Uint8Array(PIXEL)
    }),
    () =>
      Effect.promise(() =>
        client().send(
          new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key })
        )
      ).pipe(Effect.ignore)
  )
