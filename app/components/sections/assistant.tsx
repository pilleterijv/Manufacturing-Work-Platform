"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { Field } from "../shared";
export default function Assistant({ go }: { go: (section: string) => void }) {
  const [data, setData] = useState<any>(null),
    [question, setQuestion] = useState(""),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [useAI, setUseAI] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api("/api/assistant")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <section className="panel">
        <h2>Platform assistant</h2>
        <p>
          Find the right section and get step-by-step help. The assistant cannot
          make changes or view your work records, employee directory, photos or
          videos.
        </p>
        {error && <p role="alert">{error}</p>}
        {data?.canConfigure && (
          <label className="check">
            <input
              type="checkbox"
              checked={data.aiEnabled}
              onChange={async (e) => {
                try {
                  await api("/api/assistant", {
                    action: "configure",
                    enabled: e.target.checked,
                  });
                  setData(await api("/api/assistant"));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
            Enable optional external AI answers for this company{" "}
            {data.aiConfigured
              ? "(server credentials configured)"
              : "(IT must configure server credentials first)"}
          </label>
        )}
        <p className="small muted">
          {data?.aiConfigured && data.aiEnabled
            ? "Optional AI is available. Only your typed question and permitted help topics are sent when you choose AI answers. Do not enter passwords, personal information or confidential production details."
            : "Built-in guide mode is available without an AI service. External AI requires Admin enablement and private server configuration."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              setResult(await api("/api/assistant", { question, useAI }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Ask how to use the platform">
            <textarea
              required
              maxLength={1000}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="For example: How do I perform a CIL or change my dashboard?"
            />
          </Field>
          {data?.aiConfigured && data.aiEnabled && (
            <label className="check">
              <input
                type="checkbox"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
              />
              Use external AI for this question
            </label>
          )}
          <button className="primary" disabled={busy}>
            Ask assistant
          </button>
        </form>
        {result && (
          <article className="assistant-answer" aria-live="polite">
            <span className="badge">
              {result.mode === "ai" ? "AI answer" : "Built-in guide"}
            </span>
            {result.notice && <p>{result.notice}</p>}
            <p className="guide-body">{result.answer}</p>
            <div className="button-row">
              {result.links
                .filter((s: string) =>
                  data?.topics.some((t: any) => t.section === s),
                )
                .map((s: string) => (
                  <button key={s} className="outline" onClick={() => go(s)}>
                    Open {s}
                  </button>
                ))}
            </div>
          </article>
        )}
      </section>
      <section className="panel">
        <h2>Browse permitted help topics</h2>
        <div className="module-grid">
          {data?.topics.map((t: any) => (
            <button
              key={t.section}
              className="module-card"
              onClick={() => {
                setResult({
                  answer: [
                    t.text,
                    ...t.steps.map((s: string, i: number) => `${i + 1}. ${s}`),
                  ].join("\n"),
                  links: [t.section],
                  mode: "guide",
                });
              }}
            >
              <span>
                <strong>{t.section}</strong>
                <small>{t.text}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
