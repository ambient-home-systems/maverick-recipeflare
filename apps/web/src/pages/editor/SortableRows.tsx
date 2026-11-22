import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A list whose rows are put in order by dragging a handle. The handle works
 * with a finger, a mouse and the keyboard (Space to lift, arrows to move,
 * Space to drop). Dragging starts only from the handle, so the rest of a row
 * scrolls the page as usual.
 */
export function SortableRows<T extends { id: string }>({
  rows,
  onMove,
  renderRow,
  nameOf,
  label,
}: {
  rows: readonly T[];
  onMove: (from: number, to: number) => void;
  renderRow: (row: T, index: number) => ReactNode;
  /** What a row is called when its handle is read out: "2 cups flour". */
  nameOf: (row: T) => string;
  label: string;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // A short hold keeps a swipe that starts on a handle from being taken for a drag.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    const from = rows.findIndex((row) => row.id === active.id);
    const to = rows.findIndex((row) => row.id === over.id);
    if (from !== -1 && to !== -1) {
      onMove(from, to);
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={label}>
          {rows.map((row, index) => (
            <SortableRow key={row.id} id={row.id} name={nameOf(row)}>
              {renderRow(row, index)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // The lifted row sits over its neighbours on the sunk ground, with stronger rules: no shadow.
      data-field={`row:${id}`}
      className={`relative flex items-stretch border-t border-rule ${
        isDragging ? "z-[2] border-y border-rule-strong bg-surface-sunk" : "bg-surface"
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${name}`}
        // The handle sits on the row's first line, open or closed. A finger that
        // starts here can still scroll the page: the drag begins only after a hold.
        className="transition-rf flex min-h-touch w-11 flex-none cursor-grab touch-manipulation items-start justify-center self-stretch pt-3 hover:bg-surface-sunk active:cursor-grabbing"
      >
        <GripVertical aria-hidden="true" size="1.25rem" />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
