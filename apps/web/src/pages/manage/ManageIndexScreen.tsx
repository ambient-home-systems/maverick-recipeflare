import { Link } from "@tanstack/react-router";
import { ChevronRight, CloudOff } from "lucide-react";
import { Button } from "../../ui/Button";
import { EmptyState, Notice } from "../../ui/Notice";
import { Page } from "../../ui/Page";

export type ManageListKey = "categories" | "tags" | "tools" | "foods" | "units" | "labels";

export type ManageGroup = {
  key: ManageListKey;
  name: string;
  /** What the list is, in a few words. */
  detail: string;
  /** How many entries it has. Null while loading. */
  count: number | null;
};

/**
 * The household's lists, as an index: six ruled rows, each leading to its
 * list. It is given the counts; it fetches nothing itself.
 */
export function ManageIndexScreen({
  groups,
  failed = false,
  onRetry,
  signedOut = false,
  offline = false,
}: {
  groups: ManageGroup[];
  failed?: boolean;
  onRetry?: () => void;
  signedOut?: boolean;
  offline?: boolean;
}) {
  return (
    <Page title="Manage">
      {offline ? (
        <Notice icon={<CloudOff aria-hidden="true" size="1.125rem" className="flex-none" />}>
          You are offline. The lists can be read; changing them needs a connection.
        </Notice>
      ) : null}
      {failed && !signedOut ? (
        <>
          <Notice problem>The lists could not be loaded.</Notice>
          <EmptyState
            title="Could not load your lists"
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
      ) : (
        <ul aria-label="Lists">
          {groups.map((group) => (
            <li key={group.key} className="border-b border-rule last:border-b-0">
              <Link
                to="/manage/$list"
                params={{ list: group.key }}
                className="transition-rf flex min-h-touch items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-sunk"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{group.name}</span>
                  <span className="block text-sm">{group.detail}</span>
                </span>
                {group.count === null ? null : (
                  <span className="flex-none text-base font-semibold">{group.count}</span>
                )}
                <ChevronRight aria-hidden="true" size="1.25rem" className="flex-none" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
