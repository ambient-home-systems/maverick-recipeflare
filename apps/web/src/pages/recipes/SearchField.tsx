import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** How long typing must pause before the list follows it. */
export const SEARCH_PAUSE_MS = 250;

/**
 * The one search box. The list follows the text after a short pause, so there
 * is no button to press; Enter only puts the keyboard away.
 */
export function SearchField({
  value,
  onSearch,
}: {
  /** The search text in force, from the page address. */
  value: string;
  onSearch: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  const sent = useRef(value);
  const send = useRef(onSearch);
  send.current = onSearch;
  const input = useRef<HTMLInputElement>(null);

  // The address changed from elsewhere: the back button, or "clear filters".
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }, [value]);

  const flush = (next: string) => {
    const trimmed = next.trim();
    if (trimmed !== sent.current) {
      sent.current = trimmed;
      send.current(trimmed);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: flush reads only refs
  useEffect(() => {
    if (text.trim() === sent.current) {
      return;
    }
    const timer = setTimeout(() => flush(text), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <search>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          flush(text);
          input.current?.blur();
        }}
        className="search-field flex h-12 items-center rounded-md border border-rule-strong bg-surface text-ink"
      >
        <Search aria-hidden="true" size="1.25rem" className="ml-3.5 flex-none" />
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Search recipes"
          placeholder="Search recipes"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-base font-semibold placeholder:font-normal placeholder:text-ink [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText("");
              flush("");
              input.current?.focus();
            }}
            className="transition-rf inline-flex h-full min-w-touch flex-none items-center justify-center rounded-md hover:bg-surface-sunk"
          >
            <X aria-hidden="true" size="1.25rem" />
            <span className="sr-only">Clear the search</span>
          </button>
        ) : null}
      </form>
    </search>
  );
}
