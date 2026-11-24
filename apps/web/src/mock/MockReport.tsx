import { fixtureImportReport } from "@recipeflare/schema/fixtures";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import { type CompareSaid, ImportReportScreen } from "../pages/report/ImportReportScreen";
import { REPORT_SCENE_LABELS, REPORT_SCENES } from "./scenes";

const route = getRouteApi("/mock/report");

/** The import report, drawn from sample numbers. Pressing a compare button starts nothing. */
export function MockReport() {
  const { scene = "owner" } = route.useSearch();
  const [said, setSaid] = useState<CompareSaid | null>(null);
  const shown = scene === "loading" || scene === "failed" ? null : fixtureImportReport.cards;

  return (
    <>
      <ImportReportScreen
        cards={scene === "empty" ? [] : shown}
        compareWith={scene === "owner" ? fixtureImportReport.compareWith : []}
        onCompare={(profile) =>
          setSaid({
            problem: false,
            words: `Started 3 runs with ${profile}. Each appears under its import as it finishes.`,
          })
        }
        compareSaid={scene === "owner" ? said : null}
        failed={scene === "failed"}
        onRetry={() => {}}
        offline={scene === "offline"}
      />
      <aside
        aria-label="Mock controls"
        className="mx-3 mb-6 border border-dashed border-rule-strong px-4 py-3 md:mx-6"
      >
        <h2 className="text-base font-bold">Mock controls</h2>
        <p className="mt-1 text-sm">
          Not part of the screen. The numbers are samples, and nothing is run again.
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
          {REPORT_SCENES.map((name) => (
            <Link
              key={name}
              to="/mock/report"
              search={name === "owner" ? {} : { scene: name }}
              aria-current={name === scene ? "page" : undefined}
              className="inline-flex min-h-touch items-center font-semibold"
            >
              {REPORT_SCENE_LABELS[name]}
            </Link>
          ))}
          <Link to="/mock" className="inline-flex min-h-touch items-center font-semibold">
            All mock screens
          </Link>
        </p>
      </aside>
    </>
  );
}
