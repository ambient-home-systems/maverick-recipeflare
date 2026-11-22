import { getRouteApi, Link } from "@tanstack/react-router";
import { AddScreen } from "../pages/add/AddScreen";

const route = getRouteApi("/mock/add");

/** The two ways a recipe starts. Importing leads back to the list, where the import shows as a row. */
export function MockAdd() {
  const { scene } = route.useSearch();
  const navigate = route.useNavigate();
  const offline = scene === "offline";

  return (
    <>
      <AddScreen
        offline={offline}
        onImport={() => navigate({ to: "/mock/list", search: { scene: "imports" } })}
      />
      <aside
        aria-label="Mock controls"
        className="mx-3 mb-6 border border-dashed border-rule-strong px-4 py-3 md:mx-6"
      >
        <h2 className="text-base font-bold">Mock controls</h2>
        <p className="mt-1 text-sm">
          Not part of the screen. Import leads to the list with sample imports in progress, whatever
          the link. New recipe opens the editor, which is not drawn yet.
        </p>
        <p className="mt-1 text-sm">
          <Link
            to="/mock/add"
            search={offline ? {} : { scene: "offline" }}
            className="inline-flex min-h-touch items-center font-semibold"
          >
            {offline ? "Show it online" : "Show it offline"}
          </Link>
          {" · "}
          <Link to="/mock" className="inline-flex min-h-touch items-center font-semibold">
            All mock screens
          </Link>
        </p>
      </aside>
    </>
  );
}
