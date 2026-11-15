import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const [users, orders, payments, vendors] = await Promise.all([
  prisma.user.count(),
  prisma.order.count(),
  prisma.payment.count(),
  prisma.vendorProfile.count(),
]);

const tables = await prisma.$queryRawUnsafe(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('SecurityRateLimit', 'IdempotencyRecord') ORDER BY table_name",
);

console.log(JSON.stringify({
  users,
  orders,
  payments,
  vendors,
  securityTables: tables.map((row) => row.table_name),
}, null, 2));

await prisma.$disconnect();