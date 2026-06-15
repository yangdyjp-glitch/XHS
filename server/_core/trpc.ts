import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { getTokenFromRequest, verifyToken } from "./auth.js";
import { db } from "../db.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

export interface Context {
  req: Request;
  res: Response;
  user: {
    id: number;
    email: string;
    role: string;
    name: string;
    mustChangePassword: boolean;
  } | null;
  // 当处于负责人代理登录状态时，记录发起代理的原负责人（用于横幅与审计）
  impersonator?: { id: number; name: string } | null;
}

export async function createContext(req: Request, res: Response): Promise<Context> {
  const token = getTokenFromRequest(req);
  if (!token) return { req, res, user: null };

  const payload = await verifyToken(token);
  if (!payload) return { req, res, user: null };

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      name: users.name,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!user || !user.mustChangePassword === undefined) return { req, res, user: null };

  // 代理登录：令牌里带 impersonatorId 时，载入原负责人信息以供横幅展示
  let impersonator: Context["impersonator"] = null;
  if (payload.impersonatorId) {
    const [imp] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, payload.impersonatorId))
      .limit(1);
    if (imp) impersonator = imp;
  }

  return { req, res, user: user as Context["user"], impersonator };
}

export async function verifyUploadAuth(req: Request) {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return payload;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const leaderProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "leader") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅负责人可执行此操作" });
  }
  return next({ ctx });
});
