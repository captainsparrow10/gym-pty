import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical drag-and-drop list.
 *
 * Dragging is bound to an explicit handle rather than the whole row. On a phone
 * a draggable row competes with the scroll gesture, and losing the ability to
 * scroll a list is a worse outcome than needing to aim at a handle.
 *
 * The keyboard sensor is not decoration: reordering by mouse alone is
 * unusable for anyone who cannot, and dnd-kit gives arrow-key reordering for
 * the cost of one line.
 */
export function SortableList<T extends { id: string }>({
	items,
	onReorder,
	children,
	footer,
	className,
}: {
	items: T[];
	/** Called with the reordered items once a drag settles. */
	onReorder: (items: T[]) => void;
	children: (item: T, index: number) => ReactNode;
	/**
	 * Rendered after the items, inside the same container. A grid with an odd
	 * number of cards leaves a hole in the last row; putting the add affordance
	 * here fills it instead of starting a new row below.
	 */
	footer?: ReactNode;
	className?: string;
}) {
	const sensors = useSensors(
		// A small distance threshold so a tap on a button inside the row is not
		// swallowed as the start of a drag.
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const from = items.findIndex((item) => item.id === active.id);
		const to = items.findIndex((item) => item.id === over.id);
		if (from === -1 || to === -1) return;

		const next = items.slice();
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		onReorder(next);
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
			onDragEnd={handleDragEnd}
		>
			<SortableContext items={items} strategy={verticalListSortingStrategy}>
				<div className={className}>
					{items.map((item, index) => children(item, index))}
					{footer}
				</div>
			</SortableContext>
		</DndContext>
	);
}

/**
 * One row of a `SortableList`.
 *
 * `handle` is rendered by the caller wherever it fits the row's design; the
 * props it needs come back through the render function.
 */
export function SortableItem({
	id,
	children,
	className,
}: {
	id: string;
	children: (handle: ReactNode) => ReactNode;
	className?: string;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	const handle = (
		<button
			type="button"
			ref={setActivatorNodeRef}
			// dnd-kit supplies the accessible description and live announcements.
			aria-label="Reorder"
			className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
			{...attributes}
			{...listeners}
		>
			<GripVertical className="size-4" aria-hidden />
		</button>
	);

	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				// Lifted above its neighbours while dragging, or the card being moved
				// slides underneath the ones it passes.
				isDragging && "relative z-10 opacity-90 shadow-2xl",
				className,
			)}
		>
			{children(handle)}
		</div>
	);
}
