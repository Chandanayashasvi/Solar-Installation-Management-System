import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:8080"),
  PORT: z.coerce.number().default(4000),
  UPLOAD_DIR: z.string().default("./uploads"),
  ADVANCE_PERCENT: z.coerce.number().min(1).max(100).default(30),
  LABOUR_RATE_PER_HOUR: z.coerce.number().default(500),
  SERVICE_CALL_CHARGE: z.coerce.number().default(1500),
});
export const config = schema.parse(process.env);
