import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT!,
  region: process.env.S3_REGION!,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
})
const Bucket = process.env.S3_BUCKET!

const listing = await client.send(new ListObjectsV2Command({ Bucket }))
console.log(`objets dans '${Bucket}' : ${listing.KeyCount} (page 1), tronqué=${listing.IsTruncated}`)

for (const key of ["1/0002.jpg", "1/0500.png", "2/0002.jpg"]) {
  try {
    const object = await client.send(new GetObjectCommand({ Bucket, Key: key }))
    const bytes = await object.Body!.transformToByteArray()
    const magic = [...bytes.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join(" ")
    const kind = magic.startsWith("ff d8") ? "JPEG" : magic.startsWith("89 50") ? "PNG" : "?"
    console.log(`  ${key.padEnd(12)} ${String(bytes.length).padStart(7)} o  ${magic}  ${kind}`)
  } catch (error) {
    console.log(`  ${key.padEnd(12)} absent (${(error as Error).name})`)
  }
}
