import { type Asset, coverAsset } from "@recipeflare/schema";
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/Button";
import { Mark } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { moveRow } from "./editorState";
import { SMALL_BUTTON } from "./rowParts";

type Group = "photo" | "original";

const inGroup = (asset: Asset, group: Group) =>
  group === "original"
    ? asset.role === "original"
    : asset.role === "cover" || asset.role === "photo";

/**
 * The recipe's photos and its original card. A picture is pressed to choose it
 * as the cover, to put a card's sides in order, or to remove it.
 */
export function PhotoFields({
  assets,
  onChange,
  photoUrl,
  onAddPhotos,
}: {
  assets: Asset[];
  onChange: (assets: Asset[]) => void;
  photoUrl: (asset: Asset) => string | undefined;
  /** Takes the files the cook chose and returns them as the recipe's new pictures. */
  onAddPhotos: (group: Group, files: File[]) => Asset[];
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = assets.find((asset) => asset.id === chosenId);
  const cover = coverAsset({ assets });
  const renumber = (next: Asset[]) => next.map((asset, position) => ({ ...asset, position }));

  const groups: { group: Group; title: string; add: string; hint: string }[] = [
    {
      group: "photo",
      title: "Photos",
      add: "Add photos",
      hint: "The cover is the one shown on the list.",
    },
    {
      group: "original",
      title: "Original card",
      add: "Add the card",
      hint: "A photo of the paper it came from: front, then back.",
    },
  ];

  const siblings = chosen
    ? assets.filter((asset) => inGroup(asset, chosen.role === "original" ? "original" : "photo"))
    : [];
  const at = chosen ? siblings.indexOf(chosen) : -1;
  const shift = (by: number) => {
    const other = siblings[at + by];
    if (chosen && other) {
      onChange(renumber(moveRow(assets, assets.indexOf(chosen), assets.indexOf(other))));
    }
  };

  return (
    <div className="grid gap-5 px-4 py-4 md:grid-cols-2">
      {groups.map(({ group, title, add, hint }) => {
        const pictures = assets.filter((asset) => inGroup(asset, group));
        return (
          <div key={group}>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-sm">{hint}</p>
            {pictures.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-3">
                {pictures.map((asset, index) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => setChosenId(asset.id)}
                      aria-label={`${title}, picture ${index + 1} of ${pictures.length}${asset.id === cover?.id ? ", the cover" : ""}. Change or remove`}
                      className="group block rounded-sm text-left"
                    >
                      <img
                        src={photoUrl(asset)}
                        alt=""
                        width={80}
                        height={80}
                        className="transition-rf size-20 rounded-sm border border-rule bg-skeleton object-cover group-hover:border-rule-strong"
                      />
                      <span className="mt-1 flex min-h-6 items-center text-sm">
                        {group === "photo" && asset.id === cover?.id ? (
                          <Mark>cover</Mark>
                        ) : group === "original" ? (
                          `Side ${index + 1}`
                        ) : (
                          ""
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label
              className={`${SMALL_BUTTON} mt-2 cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus`}
            >
              <ImagePlus aria-hidden="true" size="1.125rem" />
              {add}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  if (files.length > 0) {
                    onChange(renumber([...assets, ...onAddPhotos(group, files)]));
                  }
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        );
      })}

      <Sheet
        open={chosen !== undefined}
        onClose={() => setChosenId(null)}
        title={chosen?.role === "original" ? "Original card" : "Photo"}
        footer={<Button onClick={() => setChosenId(null)}>Done</Button>}
      >
        {chosen ? (
          <div className="grid gap-3 px-4 py-4">
            <img
              src={photoUrl(chosen)}
              alt=""
              className="max-h-[40dvh] w-full rounded-sm border border-rule bg-skeleton object-contain"
            />
            <div className="flex flex-wrap gap-2">
              {chosen.role === "original" ? (
                <>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    disabled={at <= 0}
                    onClick={() => shift(-1)}
                  >
                    <ArrowLeft aria-hidden="true" size="1.125rem" />
                    Earlier
                  </button>
                  <button
                    type="button"
                    className={SMALL_BUTTON}
                    disabled={at === siblings.length - 1}
                    onClick={() => shift(1)}
                  >
                    <ArrowRight aria-hidden="true" size="1.125rem" />
                    Later
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  disabled={chosen.id === cover?.id}
                  onClick={() =>
                    onChange(
                      assets.map((asset) =>
                        asset.id === chosen.id
                          ? { ...asset, role: "cover" as const }
                          : asset.role === "cover"
                            ? { ...asset, role: "photo" as const }
                            : asset,
                      ),
                    )
                  }
                >
                  <Star aria-hidden="true" size="1.125rem" />
                  {chosen.id === cover?.id ? "This is the cover" : "Make it the cover"}
                </button>
              )}
              <button
                type="button"
                className={SMALL_BUTTON}
                onClick={() => {
                  onChange(renumber(assets.filter((asset) => asset.id !== chosen.id)));
                  setChosenId(null);
                }}
              >
                <Trash2 aria-hidden="true" size="1.125rem" />
                Remove
              </button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
