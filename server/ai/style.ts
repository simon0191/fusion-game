/** The team's art prompt, verbatim. Every generated monster image uses it. */
export const STYLE = `Character concept art/Game asset.

[VISUAL STYLE]: High-resolution, polished digital illustration with a clean, hand-painted texture. The style is charming and stylized, but sophisticated (targeted at 15-40), not "chibi." Think classic creature-collector key art (e.g., modern Pokémon or Temtem key illustrations) but with richer, deeper color saturation. Warm, magical "golden hour" lighting.

[MANDATORY COMPOSITION RULES]:

Strict 3/4 Front View Perspective: The creature MUST be rotated so that BOTH eyes (or the single front eye) are visible and the face is primarily facing the camera. This view should also clearly show the creature's chest and one side of its body/tail.
Isolated on a flat white background, no drop shadow cuz i need to crop them after.
Strong Silhouette: The creature's outline must be bold, clean, and unique. Avoid thin, detailed elements that might get lost on a smaller 2D screen.`;

/** What each base monster looks like, for its art prompt. Written from the card's name, element and flavor. */
export const LOOKS: Record<string, string> = {
  Emberpup: "a small fire puppy with ember-orange fur, a flickering flame tail and sparks at its nose",
  Tidalnewt: "a blue newt with fin-like head crests, two small horn-like gills and a long finned tail",
  Mossback: "a slow, round tortoise-like creature with a mossy hill on its back where small birds nest",
  Zaprat: "a yellow electric rat with a jagged lightning-bolt tail and two small horns crackling with sparks",
  Pebblor: "a round boulder creature with one big eye, stubby stone legs and a pebble-toothed grin",
  Cindermoth: "a moth with ember-glowing wings, three small eyes and two antenna horns",
  Gloomcap: "a purple mushroom creature with one big sleepy eye under a dark drooping cap",
  Bramblewolf: "a green wolf made of brambles and leaves, with a thorny tail and one horn of twisted wood",
  Voltfin: "a fish with electric yellow fins that swims through the air, sparks running along its tail",
  Grimlet: "a small shadow imp with three eyes, one horn, a thin tail and a sly grin",
  Boulderox: "a massive ox made of boulders, with one stone horn and a short rock tail",
  Frostkoi: "a koi fish with icy blue scales, frosted fins and two small horns",
  Ashdrake: "a small red dragon with ash-grey wings, one horn, a smoking tail and a bad temper",
  Stormjaw: "a hulking beast with storm-cloud fur, lightning between its two horns and a huge jaw",
  Thornlord: "an ancient walking bush with one wise eye, gnarled bark arms and a crown of thorns",
};

export const STYLE_REF_NOTE =
  "The attached image is a board of six style references: match their art style exactly (drawing, shapes, proportions, shading, palette treatment); do not copy their creatures.";
