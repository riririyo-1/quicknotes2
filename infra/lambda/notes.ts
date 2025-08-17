import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

const TABLE_NAME = process.env.TABLE_NAME!;
const BUCKET_NAME = process.env.BUCKET_NAME!;

function ok(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
function err(message: string, statusCode = 400) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  };
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const sub = (event.requestContext.authorizer?.jwt?.claims as any)?.sub as
      | string
      | undefined;
    if (!sub) return err("Unauthorized", 401);

    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    if (method === "POST" && path === "/notes") {
      const body = JSON.parse(event.body || "{}");
      const text: string = body.text || "";
      const tags: string[] = Array.isArray(body.tags)
        ? body.tags.slice(0, 5)
        : [];
      const imageKey: string | undefined = body.imageKey;

      if (!text || typeof text !== "string" || text.length > 1000)
        return err("Invalid text", 400);

      const noteId = randomUUID();
      const now = new Date().toISOString();

      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            userId: sub,
            noteId,
            text,
            tags,
            imageKey,
            createdAt: now,
            updatedAt: now,
          },
        })
      );

      return ok({ noteId });
    }

    if (method === "GET" && path === "/notes") {
      const qp = event.queryStringParameters || {};
      const limit = Math.min(parseInt(qp.limit || "20", 10), 50);
      const q = (qp.q || "").toLowerCase();
      const tag = qp.tag || "";
      const cursor = qp.cursor
        ? JSON.parse(Buffer.from(qp.cursor, "base64").toString("utf8"))
        : undefined;

      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "ByCreatedAt",
          KeyConditionExpression: "#u = :u",
          ExpressionAttributeNames: { "#u": "userId" },
          ExpressionAttributeValues: { ":u": sub },
          ScanIndexForward: false,
          Limit: limit,
          ExclusiveStartKey: cursor,
        })
      );

      let items = (res.Items || []) as any[];
      if (q)
        items = items.filter((it) => (it.text || "").toLowerCase().includes(q));
      if (tag)
        items = items.filter(
          (it) => Array.isArray(it.tags) && it.tags.includes(tag)
        );

      const nextCursor = res.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString("base64")
        : undefined;
      return ok({ items, nextCursor });
    }

    if (method === "DELETE" && path.startsWith("/notes/")) {
      const id = path.split("/")[2];
      if (!id) return err("Missing id", 400);

      await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { userId: sub, noteId: id },
        })
      );
      return ok({ ok: true });
    }

    if (method === "POST" && path.match(/^\/notes\/[^/]+\/presign$/)) {
      const id = path.split("/")[2];
      const body = JSON.parse(event.body || "{}");
      const contentType = body.contentType || "application/octet-stream";

      const key = `u=${sub}/n=${id}/${randomUUID()}`;
      const cmd = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 900 }); // 15分
      return ok({ url, key });
    }

    return err("Not Found", 404);
  } catch (e: any) {
    console.error(e);
    return err("Internal Error", 500);
  }
};
