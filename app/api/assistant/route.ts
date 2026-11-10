import { answerNavigationQuestion } from "@/lib/navigation-ai";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  grants,
  jsonBody,
  failure,
  HttpError,
  limit,
} from "@/lib/security";
import { adminPrivileges } from "@/lib/capabilities";
import { permittedHelp, guideAnswer } from "@/lib/help-catalog";
const configured = () =>
  !!(process.env.OPENAI_API_KEY && process.env.OPENAI_ASSISTANT_MODEL);
async function enabled() {
  const s = await db.setting.findUnique({ where: { key: "navigation-ai" } });
  return !!(
    s?.value &&
    typeof s.value === "object" &&
    !Array.isArray(s.value) &&
    (s.value as any).enabled === true
  );
}
export async function GET() {
  try {
    const u = await requireUser(),
      topics = permittedHelp({
        ...u,
        grants: await grants(u),
        adminPrivileges: await adminPrivileges(u),
      });
    return Response.json({
      topics,
      aiConfigured: configured(),
      aiEnabled: await enabled(),
      canConfigure: u.role === "Admin",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(),
      b = await jsonBody(req, 16 * 1024);
    if (b.action === "configure") {
      if (u.role !== "Admin")
        throw new HttpError(403, "Only Admin can enable external AI");
      const v = z.object({ enabled: z.boolean() }).parse(b);
      await db.setting.upsert({
        where: { key: "navigation-ai" },
        create: { key: "navigation-ai", value: v },
        update: { value: v },
      });
      return Response.json({ ok: true });
    }
    const v = z
      .object({
        question: z.string().trim().min(1).max(1000),
        useAI: z.boolean().default(false),
      })
      .parse(b);
    await limit(`assistant:${u.id}`, 10, 60);
    await limit("assistant:global", 100, 60);
    const topics = permittedHelp({
        ...u,
        grants: await grants(u),
        adminPrivileges: await adminPrivileges(u),
      }),
      fallback = guideAnswer(v.question, topics);
    if (!v.useAI || !configured() || !(await enabled()))
      return Response.json({ ...fallback, mode: "guide" });
    try {
      const answer = await answerNavigationQuestion(v.question, topics, {
        model: process.env.OPENAI_ASSISTANT_MODEL!,
        apiKey: process.env.OPENAI_API_KEY!,
      });
      return Response.json({ answer, links: fallback.links, mode: "ai" });
    } catch {
      return Response.json({
        ...fallback,
        mode: "guide",
        notice: "AI is unavailable. Showing built-in help instead.",
      });
    }
  } catch (e) {
    return failure(e);
  }
}
