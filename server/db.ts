import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema.js";

const connectionString = process.env.DATABASE_URL!;
const isSupabase = connectionString.includes("supabase");
const client = postgres(connectionString, {
  prepare: false,
  ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
  connect_timeout: 10,
  idle_timeout: 20,
  max_lifetime: 60 * 5,
});
export const db = drizzle(client, { schema });
