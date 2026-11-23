import { AiCheckResponse } from "@recipeflare/schema";
import { useState } from "react";
import { ApiError, api, SignedOutError } from "../api/client";
import { Button } from "../ui/Button";
import { TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";

type Result = { answer: AiCheckResponse } | { refused: string };

/** What each reason a model did not answer means, in the owner's words. */
const REASONS: Record<Extract<AiCheckResponse, { ok: false }>["reason"], string> = {
  unavailable: "The model could not be reached, or took too long.",
  limit: "An allowance is used up: free daily use, credit, or the gateway's spend limit.",
  model: "That model does not exist, has been retired, or this account may not use it.",
  request: "The request was turned down as it was sent.",
  refused: "The model declined to answer.",
  bad_answer: "The model answered, but not in the form it was asked for, twice running.",
  settings: "A setting names something that does not exist.",
};

function Outcome({ result }: { result: Result }) {
  if ("refused" in result) {
    return <Notice problem>{result.refused}</Notice>;
  }
  const { answer } = result;
  if (!answer.ok) {
    return (
      <Notice problem>
        {REASONS[answer.reason]}{" "}
        {answer.retryable
          ? "An import would try again by itself."
          : "An import would not try again."}{" "}
        Asked {answer.requested || "no model"}. The service said: {answer.message}
      </Notice>
    );
  }
  return (
    <Notice>
      {answer.model} answered in {(answer.milliseconds / 1000).toFixed(1)} seconds
      {answer.tries > 1 ? `, on try ${answer.tries}` : ""}. Profile: {answer.profile}.
      {answer.usage
        ? ` It read ${answer.usage.inputTokens} tokens and wrote ${answer.usage.outputTokens}.`
        : ""}
      {answer.logId ? ` Gateway log: ${answer.logId}.` : ""}
    </Notice>
  );
}

/**
 * Asks the Worker to put one small question to a model, and says which model
 * answered. For the owner, after a deploy or a change of settings. It spends
 * a little of the account's AI allowance each time.
 */
export function AiCheck() {
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const body = model.trim() === "" ? {} : { model: model.trim() };
      setResult({
        answer: await api("/ai/check", { method: "POST", body, schema: AiCheckResponse }),
      });
    } catch (error) {
      setResult({
        refused:
          error instanceof SignedOutError
            ? "Sign in to check the AI connection."
            : error instanceof ApiError
              ? error.message
              : "The check could not be run. The API did not answer.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ai-check" className="mx-3 mt-6 md:mx-6">
      <h2 id="ai-check" className="text-lg font-bold">
        AI connection
      </h2>
      <p className="mt-1 max-w-[60ch] text-sm">
        Puts one small question to a model, through the Worker. For the owner. Leave the box empty
        to ask the model the app would use.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <TextField
          label="Model to ask"
          value={model}
          onChange={setModel}
          className="min-w-[16rem] flex-1"
          verbatim
        />
        <Button variant="quiet" busy={busy} onClick={check}>
          Check the AI connection
        </Button>
      </div>
      {result ? (
        <div className="mt-3">
          <Outcome result={result} />
        </div>
      ) : null}
    </section>
  );
}
