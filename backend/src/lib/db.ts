import { PrismaClient, Prisma } from "@prisma/client";
export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;
export const n = (d: unknown) => Number(d ?? 0);
export async function nextNumber(tx: Tx, key: string, prefix: string) {
  const c = await tx.counter.upsert({ where: { key }, update: { value: { increment: 1 } }, create: { key, value: 1 } });
  return `${prefix}-${new Date().getFullYear()}-${String(c.value).padStart(4, "0")}`;
}
export const audit = (tx: Tx | PrismaClient, userId: string | undefined, action: string, entity: string, entityId: string, detail?: object) =>
  tx.auditLog.create({ data: { userId, action, entity, entityId, detail: detail as any } });
