import { createHash } from "node:crypto";

export function receiptFingerprint(serials: string[]) {
  return createHash("sha256").update(JSON.stringify([...serials].sort())).digest("hex");
}
