import type { ImportRun, ReportCard } from "@recipeflare/schema";
import { Link } from "@tanstack/react-router";
import { ChevronRight, CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "../../ui/Button";
import { DividerLinks } from "../../ui/DividerTabs";
import { EmptyState, Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";
import { SectionHead } from "../../ui/SectionHead";
import {
  amountWarning,
  changesDetail,
  changesHeadline,
  isUnderWay,
  runStatus,
  summarise,
  sumWords,
  tookWords,
} from "./reportWords";

/** What came of pressing a compare button, said above the buttons. */
export type CompareSaid = { problem: boolean; words: string };

const SKELETON_ROWS = [0, 1, 2, 3];

const KIND_WORDS: Record<ReportCard["kind"], string> = {
  photo: "Photographed card",
  text: "Pasted text",
  url: "Link",
  video: "Video",
};

const savedOn = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** One run's result: how many changes, where they were, and the warning that matters most. */
function RunResult({ lead, run }: { lead: string; run: ImportRun }) {
  const review = run.review;
  if (!review) {
    return (
      <p className="flex items-center gap-2 text-sm">
        {isUnderWay(run) ? (
          <LoaderCircle
            aria-hidden="true"
            size="1rem"
            className="flex-none animate-spin motion-reduce:animate-none"
          />
        ) : null}
        <span>
          <span className="font-semibold">{lead}:</span> {runStatus(run)}
        </span>
      </p>
    );
  }
  const detail = changesDetail(review);
  const warning = amountWarning(review);
  return (
    <div>
      <p className="text-sm">
        <span className="font-semibold">
          {lead}: {changesHeadline(review)}.
        </span>
        {detail ? ` ${detail}` : ""}
        {run.milliseconds > 0 ? ` The AI took ${tookWords(run.milliseconds)}.` : ""}
      </p>
      {warning ? (
        <p className="mt-1 flex items-start gap-2 text-sm font-semibold">
          <TriangleAlert aria-hidden="true" size="1.125rem" className="mt-px flex-none" />
          <span>{warning}</span>
        </p>
      ) : null}
    </div>
  );
}

function CardRow({ card }: { card: ReportCard }) {
  const title = card.title || "Untitled";
  const meta = [
    card.kind === "photo" && card.card !== undefined
      ? `${KIND_WORDS.photo} ${card.card}`
      : KIND_WORDS[card.kind],
    `Saved ${savedOn(card.savedAt)}`,
  ].join(" · ");
  const name = (
    <span className="min-w-0 flex-1">
      <span className="block text-lg font-semibold">{title}</span>
      <span className="block text-sm">{meta}</span>
    </span>
  );
  return (
    <li className="border-b border-rule last:border-b-0">
      {card.slug ? (
        <Link
          to="/recipes/$slug"
          params={{ slug: card.slug }}
          className="transition-rf flex min-h-touch items-center gap-3 px-4 pt-3 pb-2 text-ink no-underline hover:bg-surface-sunk"
        >
          {name}
          <ChevronRight aria-hidden="true" size="1.25rem" className="flex-none" />
        </Link>
      ) : (
        <div className="flex min-h-touch items-center px-4 pt-3 pb-2">{name}</div>
      )}
      <div className="grid gap-2 px-4 pb-3">
        {card.slug ? null : <p className="text-sm">This recipe has since been deleted.</p>}
        {card.review ? (
          <RunResult
            lead={
              card.profile ? `As you saved it, from the ${card.profile} draft` : "As you saved it"
            }
            run={card}
          />
        ) : (
          <p className="text-sm">Saved before changes were recorded.</p>
        )}
        {card.comparisons.map((run) => (
          <RunResult key={run.id} lead={`Run again with ${run.profile ?? "AI"}`} run={run} />
        ))}
      </div>
    </li>
  );
}

/**
 * The import report: for each saved import, how far what the cook saved was
 * from the draft, and how other sets of models did on the same card. A plain
 * ruled list. It is given the report; it fetches nothing itself.
 */
export function ImportReportScreen({
  cards,
  compareWith = [],
  onCompare,
  comparing = null,
  compareSaid = null,
  failed = false,
  onRetry,
  signedOut = false,
  offline = false,
}: {
  /** Null while the report is on its way. */
  cards: ReportCard[] | null;
  /** The profiles the saved cards can be run again with. Empty for most people, and on most installs. */
  compareWith?: string[];
  onCompare?: (profile: string) => void;
  /** The profile whose runs are being started. */
  comparing?: string | null;
  compareSaid?: CompareSaid | null;
  failed?: boolean;
  onRetry?: () => void;
  signedOut?: boolean;
  offline?: boolean;
}) {
  const sums = cards ? summarise(cards) : [];
  return (
    <>
      <DividerLinks
        label="Back to"
        to="/manage"
        links={[{ key: "manage", label: "Manage", stock: "plain" }]}
      />
      <Page
        joined
        title="Import report"
        aside={cards ? `${cards.length} saved ${cards.length === 1 ? "import" : "imports"}` : null}
      >
        {offline ? (
          <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
            You are offline. The report needs a connection.
          </Notice>
        ) : null}
        {failed && !signedOut && !offline ? (
          <>
            <Notice problem>The report could not be loaded.</Notice>
            <EmptyState
              title="Could not load the report"
              actions={
                onRetry ? (
                  <Button variant="quiet" onClick={onRetry}>
                    Try again
                  </Button>
                ) : null
              }
            >
              Something went wrong between here and the server. Nothing has been changed.
            </EmptyState>
          </>
        ) : cards === null ? (
          signedOut || offline ? null : (
            <ul aria-label="Loading the report" aria-busy="true">
              {SKELETON_ROWS.map((row) => (
                <li
                  key={row}
                  className="grid gap-2 border-b border-rule px-4 py-3.5 last:border-b-0"
                >
                  <span className="skeleton h-4 w-2/5" />
                  <span className="skeleton h-3 w-3/5" />
                </li>
              ))}
            </ul>
          )
        ) : cards.length === 0 ? (
          <EmptyState title="No imports saved yet">
            When an import is reviewed and saved, this page says how much of it had to be changed.
          </EmptyState>
        ) : (
          <>
            <p className="max-w-[60ch] px-4 py-3">
              What was changed in review before each import was saved. One change is an ingredient
              line or a step that was reworded, added, removed or moved. Three or fewer, with no
              amount corrected that the import had not doubted, is minor fixes.
            </p>
            {sums.length > 0 ? (
              <section aria-labelledby="report-sums">
                <SectionHead id="report-sums" title="Added up" />
                <ul aria-labelledby="report-sums">
                  {sums.map((sum) => (
                    <li
                      key={sum.profile ?? ""}
                      className="border-b border-rule px-4 py-2.5 last:border-b-0"
                    >
                      <span className="block font-semibold">
                        {sum.profile === null
                          ? "As you saved them"
                          : `Run again with ${sum.profile}`}
                      </span>
                      <span className="block text-sm">
                        {sumWords(sum)}
                        {sum.milliseconds > 0
                          ? ` The AI took ${tookWords(sum.milliseconds)} an import.`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section aria-labelledby="report-cards">
              <SectionHead id="report-cards" title="Each import" />
              <ul aria-labelledby="report-cards">
                {cards.map((card) => (
                  <CardRow key={card.id} card={card} />
                ))}
              </ul>
            </section>
          </>
        )}
        {onCompare && compareWith.length > 0 && cards !== null && cards.length > 0 ? (
          <section aria-labelledby="report-compare">
            <SectionHead id="report-compare" title="Compare models" />
            <p className="max-w-[60ch] px-4 pt-3">
              Runs every saved card and pasted text again with another set of models, and measures
              each new draft against the recipe you saved. Each run asks a model, so it is billed
              and counts towards the day's allowance of AI imports.
            </p>
            {compareSaid ? (
              <div className="mt-3">
                <Notice problem={compareSaid.problem}>{compareSaid.words}</Notice>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3 px-4 py-4">
              {compareWith.map((profile) => (
                <Button
                  key={profile}
                  variant="quiet"
                  disabled={comparing !== null || offline}
                  onClick={() => onCompare(profile)}
                >
                  {comparing === profile ? "Starting…" : `Run again with ${profile}`}
                </Button>
              ))}
            </div>
          </section>
        ) : null}
      </Page>
    </>
  );
}
