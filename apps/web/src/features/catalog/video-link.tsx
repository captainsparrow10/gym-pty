import { Play } from "lucide-react";

/**
 * Link out to video demonstrations of an exercise.
 *
 * A link, not an embed. Embedding needs an API key, ties the page to a player
 * that can break, and pulls in tracking; linking needs none of that and carries
 * no licensing question, because nothing is hosted or reproduced here.
 *
 * A search rather than one curated video id, deliberately. A pinned id rots the
 * moment the uploader deletes it, and 302 exercises is 302 links to keep alive.
 * A search always resolves, and the query is specific enough that the first
 * results are the exercise rather than something adjacent.
 *
 * This matters most for the held poses. A drawing shows one frozen instant,
 * which is exactly the wrong medium for a movement — and for yoga in
 * particular, where the useful information is the transition into the pose and
 * where the weight sits once you are in it.
 */
export function VideoLink({
	name,
	equipment,
	className,
}: {
	name: string;
	equipment?: string;
	className?: string;
}) {
	// The equipment disambiguates: "row" alone returns rowing machines, "Barbell
	// row" returns the lift.
	const query = [
		"how to",
		name,
		equipment && equipment !== "Bodyweight" ? equipment : "",
		"form",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<a
			href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`}
			target="_blank"
			// noreferrer as well as noopener: the target has no reason to know
			// where the click came from.
			rel="noopener noreferrer"
			className={className}
		>
			<Play className="size-4" aria-hidden />
			Watch demonstrations
			<span className="sr-only"> of {name} on YouTube, opens in a new tab</span>
		</a>
	);
}
