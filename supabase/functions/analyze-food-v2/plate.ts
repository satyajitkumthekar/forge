/**
 * Plate - everything the food analyser decides without talking to anyone:
 * what it asks the AI, the shape the answer must have, and the checks and
 * adding up it does on that answer. No server or network code lives here
 * (the call to the AI is in openai.ts), so the rules are tested on their own
 * in tests/analyser.test.mjs.
 *
 * The AI lists each food separately and never adds them up. This file checks
 * every food, refuses what cannot be true, and does the adding up itself.
 */

export const PLATE_PROMPT = `You estimate the nutrition of food for a coaching app. Clients log what they ate with a short note, a photo, or both. Most of it is Indian home cooking; many also log packaged and restaurant food from India, Europe, the UK and the US. Notes may be in English, Hindi, Marathi, German or a mix, often transliterated ("santri" is an orange, "tondli" is ivy gourd, "Magerquark" is low fat quark). Read them the way a local would.

Your job: list every food in the log as its own item, with the portion you assumed and its own numbers. Never return a total. The app adds the items up itself.

HOW TO SPLIT THE LOG INTO ITEMS
- One item for each food the client listed, and for each food that sits separately on the plate in the photo: "2 rotis, dal, rice" is three items.
- A single dish stays one item, even though you think about what is inside it. Biryani is one item, not rice plus chicken plus oil. A sandwich is one item. A smoothie is one item.
- If the client lists the parts of a bowl or plate with their own amounts ("250 g greek yogurt, berries, 1 spoon nutella, 1 scoop whey"), each part is its own item.
- Drinks, sides, chutneys, sauces, sweets, and oil or butter the client logs on their own are items too.
- If the photo shows foods the note does not mention, include them. If the note mentions foods the photo does not show, include them too: the note is what they ate.
- At most 12 items. If a spread has more, merge the smallest similar ones.

HOW MUCH (the portion)
Work down this list, stop at the first that applies, and write which one it was in amount_from:
1. "client": the client gave an amount for this food. A count, weight, volume, container, size or fraction all count ("2 rotis", "150 g", "1 katori", "half plate", "small bowl", "a handful", "3/4th medu vada"). Use exactly that. Respect fractions and words like small, big and half. A weight is the cooked weight unless they say raw, dry or uncooked; then use raw values.
2. "photo": the note gives no amount for this food, but the photo shows it. Judge the amount from the plate, bowl, spoon or hand in it.
3. "unit": no amount and no photo, but the food comes in ones and the client named one ("a banana", "samosa", "cappuccino", "protein bar", "burrito"). Count one.
4. "guess": none of the above. A loose or cooked food with nothing to go on ("dal", "rice", "sabzi", "curry", "salad", "pasta", "nuts"), or only a vague word such as some, a little or a bit. Still estimate one ordinary serving for an adult and say that it was assumed.
Be honest about amount_from. The app may ask the client how much they had instead of logging a guess, so never call a guess anything else.
Typical amounts: 1 roti or phulka 30 to 40 g, 1 paratha 80 to 100 g, 1 katori of dal or sabzi 150 to 180 g, 1 cup of cooked rice 150 to 160 g, 1 idli 40 g, 1 plain dosa 80 to 100 g, 1 egg 50 g, 1 slice of bread 30 g, 1 scoop of protein powder 30 g, 1 tablespoon 15 g, 1 teaspoon 5 g.
Write the portion in plain words, with grams or millilitres when that helps: "1 katori, about 180 g".

OIL, GHEE AND BUTTER (the part a photo cannot show)
Decide this once per item. Work down this list and stop at the first that applies:
1. The client gave the amount of fat ("1 tsp ghee", "2 tsp oil"), or said none was used ("no oil", "air fried", "boiled", "steamed", "dry roasted"): use exactly that and add nothing.
2. The client said it is from a restaurant, cafe, takeaway, delivery, a wedding or a party: use the generous end of what that dish normally carries when bought out.
3. The photo clearly shows oil or ghee pooling, or a heavy sheen: count that, once.
4. Anything else. That includes a way of cooking that needs fat when no amount was given ("sauteed", "fried", "tadka", "roasted", "bhuna"): count the normal home-cooked amount of fat for that dish and that way of cooking, at the generous end of normal, and say in "assumed" how much you counted.
Never stack these. Deep fried foods (samosa, pakora, puri, vada) already include their frying oil in their usual values: do not add oil on top. Foods with no cooking fat (fruit, plain rice, boiled eggs, curd, milk, raw vegetables, packaged foods) get none.

NUMBERS THE CLIENT TYPED WIN
- If the client typed calories or protein for a food ("protein bar (196 kcal, 22 g protein)", "60 calories kaju katli"), use those numbers exactly for that item and set numbers_from to "client". Estimate only what they did not give, and make it fit what they did.
- If the typed numbers cover the whole log ("chicken kebab bowl 950 calories 32g protein"), that log is one item with those numbers.
- Otherwise set numbers_from to "estimate".

THE NUMBERS
- calories: a whole number. protein, carbs and fat: grams.
- For each item, protein x 4 + carbs x 4 + fat x 9 should land close to its calories. Alcohol (7 per gram) and fibre can leave a gap, and that is fine.
- Use standard values for the food as cooked. Paneer is about 20 percent fat. Tandoor and grilled foods carry less fat than curries. Creamy gravies (makhani, korma, malai) carry more.
- Round estimates to sensible numbers (350, not 347). Never round numbers the client typed.
- Do not pad. Being generous is allowed only where the lists above say so.

WHAT TO WRITE IN "assumed"
One short plain sentence saying what you had to assume for this item, for the client to read: "Oil not mentioned, assumed 1 tsp." or "Size not given, assumed 1 medium bowl." or "Bought out, assumed restaurant style." If you assumed nothing, leave it empty. Do not explain your method, and do not repeat the portion.

NAMES
Short, the way the client would say it, with the count when there is one: "2 rotis", "Dal tadka", "Grilled chicken breast", "Masala chai, no sugar". Capitalise the first word only. Keep brand names the client wrote. Do not invent a brand.

WRITING STYLE for name, portion, assumed and ask
Plain simple English. Never use an em dash or an en dash: use commas and full stops.

WHEN YOU CANNOT TELL
Make the most likely reading and state it in "assumed" whenever you reasonably can ("1 scoop" alone is most likely one scoop of whey protein). Set understood to false only when there is no food you can identify at all (a note like "lunch" or "125 g" with no photo, or a photo with no food in it). Then return no items and put one short sentence in "ask" saying what to add, for example "Add what the food was, for example 2 rotis and dal." When understood is true, leave ask empty.`;

/** Added to the instructions when the AI may search the web for labels */
export const LOOKUP_PROMPT = `LOOKING UP LABELS (you can search the web)
- Search only for a named brand, a packaged product, or a dish from a chain that publishes its nutrition (for example Epigamia, Amul, Yoga Bar, Starbucks, McDonald's, Subway), and only when the client did not type its calories or protein.
- Never search for home cooking, plain foods, or a dish from a local restaurant (dal, roti, rice, sabzi, eggs, fruit, paneer butter masala from a restaurant). Estimate those as usual.
- Search for the product name and the word nutrition, nothing more, for example "Epigamia Turbo Greek yoghurt nutrition". One search per product.
- Use the numbers from the label or the brand's own nutrition page for that exact product, scaled to the amount the client had (labels give them per 100 g, per serving or per pack). Then set numbers_from to "label" and say it in assumed: "From the Epigamia label: 130 kcal, 24 g protein per 200 g."
- If you cannot find that exact product, or what you find does not look right, estimate as usual, set numbers_from to "estimate", and say in assumed that you estimated a typical one.
- A label does not change how much they had: a pack, cup or bar the client named still counts as one ("unit"), and an amount they gave is still theirs ("client").
- Never put links, web addresses or citations in any field. Say where the numbers came from in plain words, as above.`;

/**
 * The quick first question, put to a small cheap model before the main
 * one: does this log need a label looked up? Attaching the search tool to
 * the main question costs about a cent on every log, even when nothing is
 * looked up, so only logs that need it get the tool.
 */
export const BRAND_CHECK_PROMPT = `You decide whether a food log needs a nutrition label looked up online.

Answer lookup true only when the log names a specific brand, a packaged product, or a dish from a chain that publishes its nutrition (for example Epigamia, Amul, Yoga Bar, The Whole Truth, Haldiram's, Starbucks, McDonald's, Domino's, Subway), and the client did not type that food's calories or protein.

Answer lookup false for home cooking, for plain foods with no brand (dal, roti, rice, eggs, fruit, milk, whey), for a dish from a local restaurant, and for any food whose calories or protein the client typed.`;

export const BRAND_CHECK_SCHEMA = {
  type: 'object',
  properties: { lookup: { type: 'boolean' } },
  required: ['lookup'],
  additionalProperties: false,
} as const;

/** The check's answer, or null when it cannot be read */
export function readBrandCheck(answer: unknown): boolean | null {
  if (!answer || typeof answer !== 'object') return null;
  const lookup = (answer as Record<string, unknown>).lookup;
  return typeof lookup === 'boolean' ? lookup : null;
}

/**
 * Whether this log gets the web search tool: never while the admin switch
 * is off; always with a photo (a brand can show on the pack, and the check
 * only reads the note); otherwise as the brand check says, and on when the
 * check could not answer.
 */
export function searchThisLog(options: { switchOn: boolean; hasPhoto: boolean; brand: boolean | null }): boolean {
  if (!options.switchOn) return false;
  if (options.hasPhoto) return true;
  return options.brand !== false;
}

/**
 * The admin's switch for web search, as read from system_settings: off only
 * when it says false. A missing or unreadable setting leaves search on.
 */
export function webSearchSwitchOn(row: unknown): boolean {
  return !(row && typeof row === 'object' && (row as Record<string, unknown>).food_web_search === false);
}

/** The instructions for one log: with the label lookup when search is on */
export function platePrompt(options: { search?: boolean } = {}): string {
  return options.search ? `${PLATE_PROMPT}\n\n${LOOKUP_PROMPT}` : PLATE_PROMPT;
}

/**
 * Strict answer shape. Key order is the order the AI writes in, so the
 * portion and the assumption are settled before any number is written.
 */
export const PLATE_SCHEMA = {
  type: 'object',
  properties: {
    understood: { type: 'boolean' },
    ask: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          portion: { type: 'string' },
          amount_from: { type: 'string', enum: ['client', 'photo', 'unit', 'guess'] },
          assumed: { type: 'string' },
          numbers_from: { type: 'string', enum: ['client', 'label', 'estimate'] },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'portion', 'amount_from', 'assumed', 'numbers_from', 'calories', 'protein', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
  },
  required: ['understood', 'ask', 'items'],
  additionalProperties: false,
} as const;

/** Thinking counts toward this, so it is set well above what an answer needs */
export const MAX_OUTPUT_TOKENS = 12000;

const MAX_NOTE_CHARS = 2000;

export interface PlateItem {
  name: string;
  /** "1 katori, about 180 g"; empty when the AI gave none */
  portion: string;
  /** Where the amount came from: the client's words, the photo, a food that
   *  comes in ones, or the AI's own guess */
  amount_from: 'client' | 'photo' | 'unit' | 'guess';
  /** What had to be assumed, in plain words; empty when nothing was */
  assumed: string;
  /** 'client' when the client typed the calories or protein themselves,
   *  'label' when they came from a label the AI looked up */
  numbers_from: 'client' | 'label' | 'estimate';
  calories: number;
  protein: number;
  /** Grams, or null when unknown. Unknown is never the same as zero. */
  carbs: number | null;
  fat: number | null;
}

export interface PlateTotals {
  name: string;
  calories: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
}

export type PlateOutcome =
  | { ok: true; items: PlateItem[]; totals: PlateTotals }
  | { ok: false; reason: 'not_understood' | 'no_amount' | 'invalid'; message: string };

/** Hard ceiling; the AI is asked for at most 12 */
export const MAX_ITEMS = 20;
const MAX_ITEM_CALORIES = 5000;
const MAX_ITEM_PROTEIN = 500;
const MAX_ITEM_GRAMS = 999;

export const NOT_UNDERSTOOD_MESSAGE =
  'Could not tell what this food was. Add a few words about it and send it again.';
export const INVALID_MESSAGE = 'Could not work this one out. Please send it again.';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const round1 = (value: number): number => Math.round(value * 10) / 10;

// Figure dash, en dash, em dash and horizontal bar, built from their codes so
// that none of these characters, and no escape for them, sits in this file
const DASH_CHARS = [0x2012, 0x2013, 0x2014, 0x2015].map((code) => String.fromCharCode(code)).join('');
const DASH_BETWEEN_NUMBERS = new RegExp('([0-9]) ?[' + DASH_CHARS + '] ?([0-9])', 'g');
const ANY_DASH = new RegExp(' ?[' + DASH_CHARS + '] ?', 'g');

// Links the AI adds after a web search, such as a citation like
// ([site](address)). The address goes first, then what is left of the link.
const WEB_ADDRESS = /(?:https?:\/\/|www\.)[^\s)\]]*[^\s)\].,;:!?]/g;
const CITATION = /\(\s*\[[^\]]*\]\(\s*\)\s*\)/g;
const LINK = /\[([^\]]*)\]\(\s*\)/g;
const EMPTY_BRACKETS = /\(\s*\)|\[\s*\]/g;
const SPACE_BEFORE_STOP = /\s+([.,;:!?])/g;

/** Text with every web address and citation taken out; a link keeps its words */
export function withoutLinks(value: string): string {
  return value
    .replace(WEB_ADDRESS, '')
    .replace(CITATION, '')
    .replace(LINK, '$1')
    .replace(EMPTY_BRACKETS, '');
}

/**
 * Text from the AI as the app shows it: one line, trimmed, capped, with no
 * links, and with no em or en dashes (a number range reads "30 to 40",
 * anything else gets a comma).
 */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return withoutLinks(value)
    .replace(/\s+/g, ' ')
    .replace(DASH_BETWEEN_NUMBERS, '$1 to $2')
    .replace(ANY_DASH, ', ')
    .replace(SPACE_BEFORE_STOP, '$1')
    .trim()
    .slice(0, max)
    .trim();
}

/** Carbs or fat as stored (one decimal), or null when missing or nonsense */
function optionalGrams(value: unknown): number | null {
  if (!isNumber(value) || value < 0 || value > MAX_ITEM_GRAMS) return null;
  return round1(value);
}

/** Protein alone cannot carry more energy than the food has */
export function proteinFits(calories: number, protein: number): boolean {
  return protein * 4 <= calories * 1.15 + 20;
}

/**
 * The four numbers can belong to one food. Only one direction is checked:
 * macros that add up to far more than the calories are impossible, while
 * calories above the macros are normal (alcohol, rounding).
 */
export function macrosFit(calories: number, protein: number, carbs: number, fat: number): boolean {
  return protein * 4 + carbs * 4 + fat * 9 <= calories * 1.35 + 50;
}

function readItem(entry: unknown): PlateItem | null {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as Record<string, unknown>;

  const name = cleanText(raw.name, 120);
  if (!name) return null;
  if (!isNumber(raw.calories) || raw.calories < 0 || raw.calories > MAX_ITEM_CALORIES) return null;
  if (!isNumber(raw.protein) || raw.protein < 0 || raw.protein > MAX_ITEM_PROTEIN) return null;

  const numbers_from =
    raw.numbers_from === 'client' ? 'client' : raw.numbers_from === 'label' ? 'label' : 'estimate';
  // Only the AI's own word for it counts as a guess: anything unexpected is
  // never held against the client
  const amount_from =
    raw.amount_from === 'photo' || raw.amount_from === 'unit' || raw.amount_from === 'guess'
      ? raw.amount_from
      : 'client';
  const calories = Math.round(raw.calories);
  const protein = round1(raw.protein);
  let carbs = optionalGrams(raw.carbs);
  let fat = optionalGrams(raw.fat);

  // Numbers the client typed are theirs: never second-guessed. Numbers from
  // a label went through the AI's scaling, so they are checked like any
  // estimate.
  if (numbers_from !== 'client') {
    // Calories and protein that contradict each other cannot be logged
    if (!proteinFits(calories, protein)) return null;
    // Carbs and fat are the optional pair: when they do not fit, they are
    // unknown, and the food is still logged
    if (carbs !== null && fat !== null && !macrosFit(calories, protein, carbs, fat)) {
      carbs = null;
      fat = null;
    }
  }

  return {
    name,
    portion: cleanText(raw.portion, 160),
    amount_from,
    assumed: cleanText(raw.assumed, 240),
    numbers_from,
    calories,
    protein,
    carbs,
    fat,
  };
}

/** The adding up, done here and never by the AI */
export function addUp(items: PlateItem[]): PlateTotals {
  const total = (key: 'carbs' | 'fat'): number | null =>
    items.every((item) => item[key] !== null)
      ? round1(items.reduce((sum, item) => sum + (item[key] as number), 0))
      : null;

  return {
    name: items.map((item) => item.name).join(', ').slice(0, 300),
    calories: items.reduce((sum, item) => sum + item.calories, 0),
    protein: round1(items.reduce((sum, item) => sum + item.protein, 0)),
    // A total that only covers some of the foods would read as the whole
    // plate, so it stays unknown instead
    carbs: total('carbs'),
    fat: total('fat'),
  };
}

/** Below this, how much there was cannot change the day: water, black coffee */
export const NEGLIGIBLE_CALORIES = 10;

/**
 * A food the client has to say more about before it can be logged: the AI
 * had to guess how much there was (no amount in the note, and not a food
 * that comes in ones). Numbers the client typed themselves need no amount,
 * and neither does a food with next to no calories.
 */
export function needsAmount(food: { amount_from?: unknown; numbers_from?: unknown; calories?: unknown }): boolean {
  if (food.amount_from !== 'guess' || food.numbers_from === 'client') return false;
  return !(isNumber(food.calories) && food.calories < NEGLIGIBLE_CALORIES);
}

/** Past this many foods the ask stops naming them one by one */
const MAX_NAMED_FOODS = 4;

/**
 * A food's name as it reads inside a sentence: "Dal tadka" becomes
 * "dal tadka", and only the part before a comma is kept. A name with a
 * capital further in ("KFC wings") is left as it is.
 */
function inSentence(name: string): string {
  const head = name.split(',')[0].trim() || name;
  const rest = head.slice(1);
  return rest === rest.toLowerCase() ? head.charAt(0).toLowerCase() + rest : head;
}

/** What the client is told when a log is turned back for want of an amount */
export function amountAsk(names: string[]): string {
  const foods = names.map(inSentence);
  const what =
    foods.length === 0 || foods.length > MAX_NAMED_FOODS
      ? 'of each food'
      : foods.length === 1
        ? foods[0]
        : `${foods.slice(0, -1).join(', ')} and ${foods[foods.length - 1]}`;
  return `Add how much ${what} you had, for example 1 katori, 1 cup or 150 g. Or add a photo.`;
}

/**
 * Checks the AI's parsed answer. One impossible food fails the whole log:
 * a plate is logged complete or not at all. With requireAmount, a log is
 * also turned back when the amount of any food was only a guess, naming
 * the foods so the client can add how much and send it again.
 */
export function readPlate(answer: unknown, options: { requireAmount?: boolean } = {}): PlateOutcome {
  const invalid: PlateOutcome = { ok: false, reason: 'invalid', message: INVALID_MESSAGE };
  if (!answer || typeof answer !== 'object') return invalid;

  const { understood, ask, items } = answer as Record<string, unknown>;
  if (!Array.isArray(items)) return invalid;
  if (understood !== true || items.length === 0) {
    return { ok: false, reason: 'not_understood', message: cleanText(ask, 200) || NOT_UNDERSTOOD_MESSAGE };
  }
  if (items.length > MAX_ITEMS) return invalid;

  const clean: PlateItem[] = [];
  for (const entry of items) {
    const item = readItem(entry);
    if (!item) return invalid;
    clean.push(item);
  }

  if (options.requireAmount) {
    const unsure = clean.filter(needsAmount);
    if (unsure.length > 0) {
      return { ok: false, reason: 'no_amount', message: amountAsk(unsure.map((item) => item.name)) };
    }
  }
  return { ok: true, items: clean, totals: addUp(clean) };
}

/** What the AI is told about the client's note */
export function noteText(description?: string | null): string {
  const note = (description ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE_CHARS);
  return note ? `The client's note: ${note}` : 'The client sent only a photo, with no note.';
}

/** One question to the AI */
export interface Ask {
  model: string;
  effort: string;
  description?: string | null;
  /** A base64 data URL (see isUsablePhoto), or nothing */
  image?: string | null;
  /** The AI may search the web for labels */
  search?: boolean;
}

/** What comes back: the written answer and what it used, or why there is none */
export type Asked =
  | {
      ok: true;
      text: string;
      usage: {
        input_tokens: number | null;
        cached_tokens: number | null;
        output_tokens: number | null;
        /** The thinking part of output_tokens */
        reasoning_tokens: number | null;
      };
      /** Web searches and page reads the AI made, and the sites it read */
      lookups: { count: number; sites: string[] };
    }
  | { ok: false; why: string };

/**
 * A photo as the app sends it: a base64 data URL in a format the AI reads
 * (the app re-encodes photos to JPEG before sending), and not too big.
 */
export function isUsablePhoto(image: unknown): image is string {
  return (
    typeof image === 'string' &&
    /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(image) &&
    image.length <= 14_000_000
  );
}
