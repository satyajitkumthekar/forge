/**
 * Tests for the food analyser's rules: the checks and adding up it does on
 * the AI's answer, and how the request to the AI is built and its reply read.
 * No network and no keys: nothing here talks to a model.
 *
 *   node --test tests/*.test.mjs
 *
 * Needs Node 22.18 or newer, which runs the TypeScript files directly.
 * Nothing imports this file, so it is not part of the app or the function.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOKUP_PROMPT,
  PLATE_PROMPT,
  PLATE_SCHEMA,
  MAX_ITEMS,
  MAX_OUTPUT_TOKENS,
  NEGLIGIBLE_CALORIES,
  NOT_UNDERSTOOD_MESSAGE,
  INVALID_MESSAGE,
  addUp,
  amountAsk,
  cleanText,
  withoutLinks,
  isUsablePhoto,
  macrosFit,
  needsAmount,
  noteText,
  platePrompt,
  proteinFits,
  readPlate,
  webSearchSwitchOn,
} from '../supabase/functions/analyze-food-v2/plate.ts';
import {
  MAX_LOOKUPS,
  ReplyFollower,
  buildOpenAIRequest,
  lookupsOf,
  readOpenAIReply,
} from '../supabase/functions/analyze-food-v2/openai.ts';
import { EventReader, FoodScanner, readLookup, siteOf, toEvent } from '../supabase/functions/analyze-food-v2/stream.ts';

const food = (over = {}) => ({
  name: 'Dal',
  portion: '1 katori, about 180 g',
  amount_from: 'client',
  assumed: 'Oil not mentioned, assumed 1 tsp.',
  numbers_from: 'estimate',
  calories: 190,
  protein: 10,
  carbs: 26,
  fat: 5,
  ...over,
});

const plate = (items, over = {}) => ({ understood: true, ask: '', items, ...over });

// ---------- the adding up ----------

test('a plate of three foods comes back as three foods, added up in code', () => {
  const outcome = readPlate(
    plate([
      food(),
      food({ name: 'Rice', portion: '1 cup cooked', assumed: '', calories: 210, protein: 4, carbs: 46, fat: 0.5 }),
      food({ name: '2 rotis', portion: 'about 40 g each', assumed: '', calories: 200, protein: 6, carbs: 40, fat: 2 }),
    ])
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.items.length, 3);
  assert.deepEqual(outcome.totals, { name: 'Dal, Rice, 2 rotis', calories: 600, protein: 20, carbs: 112, fat: 7.5 });
});

test('totals do not pick up floating point dust', () => {
  const totals = addUp([
    { ...food(), name: 'A', protein: 0.1, carbs: 0.1, fat: 0.1 },
    { ...food(), name: 'B', protein: 0.2, carbs: 0.2, fat: 0.2 },
  ]);
  assert.equal(totals.protein, 0.3);
  assert.equal(totals.carbs, 0.3);
  assert.equal(totals.fat, 0.3);
});

test('calories are whole numbers and grams keep one decimal', () => {
  const outcome = readPlate(plate([food({ calories: 189.6, protein: 10.04, carbs: 26.26, fat: 4.95 })]));
  assert.equal(outcome.ok, true);
  const [item] = outcome.items;
  assert.deepEqual([item.calories, item.protein, item.carbs, item.fat], [190, 10, 26.3, 5]);
});

test('a carbs or fat total stays unknown when any food lacks it', () => {
  const outcome = readPlate(plate([food(), food({ name: 'Mystery sweet', carbs: -1, fat: 4 })]));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.items[1].carbs, null);
  assert.equal(outcome.items[1].fat, 4);
  assert.equal(outcome.totals.carbs, null);
  assert.equal(outcome.totals.fat, 9);
});

// ---------- what gets refused ----------

test('a log the AI could not read fails with its own short ask', () => {
  const outcome = readPlate(plate([], { understood: false, ask: 'Add what the food was, for example 2 rotis and dal.' }));
  assert.deepEqual(outcome, {
    ok: false,
    reason: 'not_understood',
    message: 'Add what the food was, for example 2 rotis and dal.',
  });
});

test('no ask, or no foods at all, falls back to the standard message', () => {
  assert.deepEqual(readPlate(plate([], { understood: false })), {
    ok: false,
    reason: 'not_understood',
    message: NOT_UNDERSTOOD_MESSAGE,
  });
  assert.deepEqual(readPlate(plate([])), { ok: false, reason: 'not_understood', message: NOT_UNDERSTOOD_MESSAGE });
});

test('foods listed alongside "not understood" are not logged', () => {
  assert.equal(readPlate(plate([food()], { understood: false })).ok, false);
});

test('answers that are not a plate are refused', () => {
  for (const bad of [null, undefined, 'text', 42, [], {}, { understood: true, ask: '' }, { understood: true, items: 'x' }]) {
    assert.equal(readPlate(bad).ok, false, JSON.stringify(bad));
  }
});

test('one impossible food fails the whole plate', () => {
  const impossible = [
    { calories: -5 },
    { calories: Number.NaN },
    { calories: Number.POSITIVE_INFINITY },
    { calories: '190' },
    { calories: 5001 },
    { protein: -1 },
    { protein: 501 },
    { protein: null },
    { name: '   ' },
    { name: 7 },
  ];
  for (const over of impossible) {
    assert.deepEqual(
      readPlate(plate([food(), food(over)])),
      { ok: false, reason: 'invalid', message: INVALID_MESSAGE },
      JSON.stringify(over)
    );
  }
});

test('more foods than the ceiling is refused, the ceiling itself is fine', () => {
  const many = (count) => Array.from({ length: count }, (_, i) => food({ name: `Food ${i + 1}` }));
  assert.equal(readPlate(plate(many(MAX_ITEMS))).ok, true);
  assert.equal(readPlate(plate(many(MAX_ITEMS + 1))).ok, false);
});

test('protein that cannot fit the calories fails the log', () => {
  assert.equal(proteinFits(120, 24), true);
  assert.equal(proteinFits(50, 30), false);
  assert.equal(readPlate(plate([food({ calories: 50, protein: 30, carbs: 0, fat: 0 })])).ok, false);
});

test('carbs and fat that cannot fit become unknown, and the food still logs', () => {
  assert.equal(macrosFit(190, 10, 26, 5), true);
  assert.equal(macrosFit(100, 10, 40, 20), false);
  const outcome = readPlate(plate([food({ calories: 100, protein: 10, carbs: 40, fat: 20 })]));
  assert.equal(outcome.ok, true);
  const [item] = outcome.items;
  assert.deepEqual([item.calories, item.protein, item.carbs, item.fat], [100, 10, null, null]);
});

test('calories above the macros are normal: alcohol and zero calorie drinks log', () => {
  assert.equal(readPlate(plate([food({ name: '2 cups of mulled wine', calories: 400, protein: 0, carbs: 50, fat: 0 })])).ok, true);
  assert.equal(readPlate(plate([food({ name: 'Diet soda', calories: 0, protein: 0, carbs: 0, fat: 0 })])).ok, true);
  assert.equal(readPlate(plate([food({ name: 'Black coffee', calories: 5, protein: 0.3, carbs: 0.5, fat: 0 })])).ok, true);
});

test('numbers the client typed are kept exactly, even when they look odd', () => {
  const outcome = readPlate(
    plate([food({ name: 'Protein bar', numbers_from: 'client', calories: 196, protein: 60, carbs: 30, fat: 20 })])
  );
  assert.equal(outcome.ok, true);
  const [item] = outcome.items;
  assert.deepEqual(
    [item.numbers_from, item.calories, item.protein, item.carbs, item.fat],
    ['client', 196, 60, 30, 20]
  );
});

test('numbers from a label are kept as such, and checked like an estimate', () => {
  const outcome = readPlate(
    plate([food({ name: 'Epigamia Turbo yoghurt', numbers_from: 'label', calories: 163, protein: 30, carbs: 9, fat: 1 })])
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.items[0].numbers_from, 'label');
  // A label scaled into something that cannot be true still fails the log
  assert.equal(readPlate(plate([food({ numbers_from: 'label', calories: 50, protein: 30 })])).ok, false);
});

test('an unknown numbers_from is treated as an estimate', () => {
  const outcome = readPlate(plate([food({ numbers_from: 'website' })]));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.items[0].numbers_from, 'estimate');
});

// ---------- no amount, no photo, no log ----------

const guessed = (over = {}) =>
  food({ amount_from: 'guess', portion: '1 katori, about 180 g', assumed: 'Size not given, assumed 1 katori.', ...over });

test('a guessed amount turns the whole log back and says which foods need one', () => {
  const outcome = readPlate(
    plate([guessed(), guessed({ name: 'Rice', calories: 210, protein: 4, carbs: 46, fat: 0.5 })]),
    { requireAmount: true }
  );
  assert.deepEqual(outcome, {
    ok: false,
    reason: 'no_amount',
    message: 'Add how much dal and rice you had, for example 1 katori, 1 cup or 150 g. Or add a photo.',
  });
});

test('in a mixed log only the guessed foods are asked about', () => {
  const outcome = readPlate(plate([food({ name: '2 rotis' }), guessed(), guessed({ name: 'Rice' })]), {
    requireAmount: true,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'no_amount');
  assert.equal(outcome.message, 'Add how much dal and rice you had, for example 1 katori, 1 cup or 150 g. Or add a photo.');
});

test('an amount from the client, from the photo, or a food that comes in ones goes through', () => {
  for (const amount_from of ['client', 'photo', 'unit']) {
    const outcome = readPlate(plate([food({ amount_from })]), { requireAmount: true });
    assert.equal(outcome.ok, true, amount_from);
    assert.equal(outcome.items[0].amount_from, amount_from);
  }
});

test('numbers the client typed need no amount', () => {
  const outcome = readPlate(
    plate([guessed({ name: 'Chicken kebab bowl', numbers_from: 'client', calories: 950, protein: 32, carbs: 90, fat: 40 })]),
    { requireAmount: true }
  );
  assert.equal(outcome.ok, true);
});

test('a food with next to no calories never turns a log back', () => {
  const coffee = guessed({ name: 'Black coffee', calories: 5, protein: 0.3, carbs: 0.5, fat: 0 });
  const water = guessed({ name: 'Water', calories: 0, protein: 0, carbs: 0, fat: 0 });
  assert.equal(readPlate(plate([food(), coffee, water]), { requireAmount: true }).ok, true);

  // Right at the line it counts as a real food again
  const pickle = guessed({ name: 'Pickle', calories: NEGLIGIBLE_CALORIES, protein: 0, carbs: 1, fat: 1 });
  const outcome = readPlate(plate([food(), pickle]), { requireAmount: true });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.message, 'Add how much pickle you had, for example 1 katori, 1 cup or 150 g. Or add a photo.');
});

test('with the rule off, a guess is logged as before, with what was assumed', () => {
  for (const outcome of [readPlate(plate([guessed()])), readPlate(plate([guessed()]), { requireAmount: false })]) {
    assert.equal(outcome.ok, true);
    assert.equal(outcome.items[0].amount_from, 'guess');
    assert.equal(outcome.items[0].assumed, 'Size not given, assumed 1 katori.');
  }
});

test('an unexpected or missing amount_from is never held against the client', () => {
  for (const amount_from of ['maybe', '', null, undefined, 7]) {
    const outcome = readPlate(plate([food({ amount_from })]), { requireAmount: true });
    assert.equal(outcome.ok, true, String(amount_from));
    assert.equal(outcome.items[0].amount_from, 'client');
  }
});

test('an impossible food still fails the log as invalid, not as a missing amount', () => {
  const outcome = readPlate(plate([guessed(), guessed({ name: 'Rice', calories: -5 })]), { requireAmount: true });
  assert.deepEqual(outcome, { ok: false, reason: 'invalid', message: INVALID_MESSAGE });
});

test('the ask names up to four foods in plain words, then stops listing them', () => {
  const tail = ' you had, for example 1 katori, 1 cup or 150 g. Or add a photo.';
  assert.equal(amountAsk(['Dal']), 'Add how much dal' + tail);
  assert.equal(amountAsk(['Baingan bharta', 'Chole curry']), 'Add how much baingan bharta and chole curry' + tail);
  assert.equal(amountAsk(['Dal', 'Rice', 'Sabzi']), 'Add how much dal, rice and sabzi' + tail);
  assert.equal(amountAsk(['Dal', 'Rice', 'Sabzi', 'Curd']), 'Add how much dal, rice, sabzi and curd' + tail);
  assert.equal(amountAsk(['Dal', 'Rice', 'Sabzi', 'Curd', 'Salad']), 'Add how much of each food' + tail);
  assert.equal(amountAsk([]), 'Add how much of each food' + tail);
  // Only the part before a comma, and capitals further in are kept
  assert.equal(amountAsk(['Curd, plain']), 'Add how much curd' + tail);
  assert.equal(amountAsk(['KFC wings']), 'Add how much KFC wings' + tail);
});

test('needsAmount reads the answer the same way before and after it is checked', () => {
  assert.equal(needsAmount({ amount_from: 'guess', numbers_from: 'estimate', calories: 190 }), true);
  assert.equal(needsAmount({ amount_from: 'guess', numbers_from: 'client', calories: 190 }), false);
  // A label gives the numbers per amount, not how much they had
  assert.equal(needsAmount({ amount_from: 'guess', numbers_from: 'label', calories: 190 }), true);
  assert.equal(needsAmount({ amount_from: 'guess', numbers_from: 'estimate', calories: 0 }), false);
  assert.equal(needsAmount({ amount_from: 'unit', numbers_from: 'estimate', calories: 190 }), false);
  assert.equal(needsAmount({ amount_from: 'guess' }), true);
  assert.equal(needsAmount({}), false);
});

// ---------- the words ----------

test('text is one clean line with no em or en dashes', () => {
  assert.equal(cleanText('  Dal — home cooked  ', 120), 'Dal, home cooked');
  assert.equal(cleanText('30–40 g each', 120), '30 to 40 g each');
  assert.equal(cleanText('1 katori,\n about   180 g', 120), '1 katori, about 180 g');
  assert.equal(cleanText('abcdefghij', 4), 'abcd');
  assert.equal(cleanText(undefined, 10), '');
  assert.equal(cleanText(12, 10), '');
});

test('links and citations from a web search never reach the client', () => {
  // What the AI actually wrote in testing, with the address shortened
  assert.equal(
    cleanText('Used Starbucks US nutrition for a hot latte with 2% milk. ([starbucks.com](https://www.starbucks.com/menu/product/407/hot/nutrition?utm_source=openai))', 240),
    'Used Starbucks US nutrition for a hot latte with 2% milk.'
  );
  assert.equal(
    cleanText('Nutrition is from McDonald\'s India. ([mcdindia.com](https://mcdindia.com/wp-content/uploads/2025/12/booklet.pdf))', 240),
    "Nutrition is from McDonald's India."
  );
  // A link keeps its words; a bare address goes
  assert.equal(cleanText('See [the Amul page](https://amul.com/x) for details', 240), 'See the Amul page for details');
  assert.equal(cleanText('From the label at https://amul.com/taaza.', 240), 'From the label at.');
  assert.equal(withoutLinks('Plain text (with brackets) stays'), 'Plain text (with brackets) stays');
  // A long address is removed before the text is capped, so it cannot eat the space
  const long = 'From the Epigamia label. ([bigbasket.com](https://bigbasket.com/' + 'x'.repeat(400) + '))';
  assert.equal(cleanText(long, 240), 'From the Epigamia label.');
});

test('the words on each food are cleaned on the way through', () => {
  const outcome = readPlate(
    plate([
      food({
        name: 'Dal – tadka',
        portion: '1 katori — about 180 g',
        assumed: 'Oil not mentioned — assumed 1 tsp.',
      }),
    ])
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.items[0].name, 'Dal, tadka');
  assert.equal(outcome.items[0].portion, '1 katori, about 180 g');
  assert.equal(outcome.items[0].assumed, 'Oil not mentioned, assumed 1 tsp.');
  // Including any link the AI added
  const linked = readPlate(plate([food({ assumed: 'From the Amul label. ([amul.com](https://amul.com/m?utm_source=openai))' })]));
  assert.equal(linked.items[0].assumed, 'From the Amul label.');
});

test('the instructions and the messages shown to clients contain no em or en dashes', () => {
  for (const words of [platePrompt({ search: true }), NOT_UNDERSTOOD_MESSAGE, INVALID_MESSAGE, amountAsk(['Dal', 'Rice']), amountAsk([])]) {
    assert.equal(/[‒-―]/.test(words), false);
  }
});

test('the note is cleaned and capped', () => {
  assert.equal(noteText('  dal,\n rice  '), "The client's note: dal, rice");
  assert.equal(noteText('   '), 'The client sent only a photo, with no note.');
  assert.equal(noteText(null), 'The client sent only a photo, with no note.');
  assert.equal(noteText('x'.repeat(5000)).length, "The client's note: ".length + 2000);
});

test('the answer shape follows the strict rules: every field required, nothing extra, no size limits', () => {
  const check = (node) => {
    // Size limits such as maxLength are not reliably supported in strict mode
    for (const banned of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'multipleOf']) {
      assert.equal(banned in node, false, banned);
    }
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
      Object.values(node.properties).forEach(check);
    }
    if (node.type === 'array') check(node.items);
  };
  check(PLATE_SCHEMA);
});

test('only real image data URLs of a sane size count as a photo', () => {
  assert.equal(isUsablePhoto('data:image/jpeg;base64,AAAA'), true);
  assert.equal(isUsablePhoto('data:image/png;base64,AAAA'), true);
  assert.equal(isUsablePhoto('data:image/webp;base64,AAAA'), true);
  assert.equal(isUsablePhoto('https://example.com/x.jpg'), false);
  assert.equal(isUsablePhoto('data:text/html;base64,AAAA'), false);
  assert.equal(isUsablePhoto('data:image/heic;base64,AAAA'), false);
  assert.equal(isUsablePhoto(undefined), false);
  assert.equal(isUsablePhoto('data:image/jpeg;base64,' + 'A'.repeat(14_000_001)), false);
});

// ---------- OpenAI: the request and the reply ----------

test('OpenAI: the request carries the note, the photo, the answer shape and no storage', () => {
  const image = 'data:image/jpeg;base64,AAAA';
  const request = buildOpenAIRequest({ model: 'test-model', effort: 'low', description: '  dal,\n rice  ', image });
  assert.equal(request.model, 'test-model');
  assert.deepEqual(request.reasoning, { effort: 'low' });
  assert.equal(request.instructions, PLATE_PROMPT);
  assert.equal(request.store, false);
  assert.equal(request.max_output_tokens, MAX_OUTPUT_TOKENS);
  assert.deepEqual(request.input, [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: "The client's note: dal, rice" },
        { type: 'input_image', image_url: image, detail: 'high' },
      ],
    },
  ]);
  assert.deepEqual(request.text, { format: { type: 'json_schema', name: 'plate', strict: true, schema: PLATE_SCHEMA } });
  assert.equal('temperature' in request, false);
  // Search off: no tools, and nothing in the instructions about searching
  assert.equal('tools' in request, false);
  assert.equal('max_tool_calls' in request, false);
  assert.equal(request.instructions.includes('LOOKING UP LABELS'), false);
});

test('OpenAI: with search on, the AI gets web search, a cap on lookups, and the rules for labels', () => {
  const request = buildOpenAIRequest({ model: 'm', effort: 'low', description: '250 g epigamia turbo', search: true });
  assert.deepEqual(request.tools, [
    { type: 'web_search', search_context_size: 'low', user_location: { type: 'approximate' } },
  ]);
  assert.equal(request.max_tool_calls, MAX_LOOKUPS);
  assert.deepEqual(request.include, ['web_search_call.action.sources']);
  assert.equal(request.instructions, `${PLATE_PROMPT}\n\n${LOOKUP_PROMPT}`);
  assert.deepEqual(request.text, { format: { type: 'json_schema', name: 'plate', strict: true, schema: PLATE_SCHEMA } });
  assert.equal(request.store, false);
});

test('the admin switch turns web search off only when it says false', () => {
  assert.equal(webSearchSwitchOn({ food_web_search: false }), false);
  assert.equal(webSearchSwitchOn({ food_web_search: true }), true);
  // Not set up yet, unreadable, or anything unexpected: search stays on
  for (const row of [null, undefined, {}, { food_web_search: null }, { food_web_search: 'false' }, 'x']) {
    assert.equal(webSearchSwitchOn(row), true, JSON.stringify(row));
  }
});

test('the answer shape allows numbers from a label', () => {
  assert.deepEqual(PLATE_SCHEMA.properties.items.items.properties.numbers_from.enum, ['client', 'label', 'estimate']);
});

test('OpenAI: a note with no photo sends no image', () => {
  const request = buildOpenAIRequest({ model: 'm', effort: 'low', description: 'dal' });
  assert.equal(request.input[0].content.length, 1);
});

test('OpenAI: the reply text is found after the thinking block', () => {
  const reply = {
    status: 'completed',
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: '{"understood":true}' }] },
    ],
  };
  assert.deepEqual(readOpenAIReply(reply), { ok: true, text: '{"understood":true}' });
});

test('OpenAI: cut off, refused, failed and empty replies are reported, never guessed at', () => {
  assert.deepEqual(
    readOpenAIReply({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }),
    { ok: false, why: 'incomplete: max_output_tokens' }
  );
  assert.deepEqual(readOpenAIReply({ status: 'failed', output: [] }), { ok: false, why: 'status failed' });
  assert.deepEqual(
    readOpenAIReply({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }),
    { ok: false, why: 'refusal' }
  );
  assert.deepEqual(readOpenAIReply({ status: 'completed', output: [{ type: 'reasoning' }] }), {
    ok: false,
    why: 'no text in reply',
  });
  assert.deepEqual(readOpenAIReply(null), { ok: false, why: 'empty reply' });
});

// ---------- progress while the answer is still being written ----------

const sampleAnswer = JSON.stringify({
  understood: true,
  ask: '',
  items: [
    food(),
    food({ name: 'Rice', portion: '1 cup cooked', assumed: '', calories: 210, protein: 4, carbs: 46, fat: 0.5 }),
    food({ name: '2 rotis', portion: 'about 40 g each', assumed: '', calories: 200, protein: 6, carbs: 40, fat: 2 }),
  ],
});

test('each food is reported once the AI has written it in full, in order', () => {
  const found = new FoodScanner().push(sampleAnswer);
  assert.deepEqual(found, [
    { name: 'Dal', portion: '1 katori, about 180 g', assumed: 'Oil not mentioned, assumed 1 tsp.', needs_amount: false },
    { name: 'Rice', portion: '1 cup cooked', assumed: '', needs_amount: false },
    { name: '2 rotis', portion: 'about 40 g each', assumed: '', needs_amount: false },
  ]);
});

test('the answer can arrive a character at a time: same foods, each exactly once, at the right moment', () => {
  const scanner = new FoodScanner();
  const seen = [];
  const firstFoodEnds = sampleAnswer.indexOf('}', sampleAnswer.indexOf('"Dal"'));
  for (let i = 0; i < sampleAnswer.length; i++) {
    const found = scanner.push(sampleAnswer[i]);
    // Nothing is reported for a food before its closing brace has arrived
    if (i < firstFoodEnds) assert.equal(found.length, 0, `reported early at ${i}`);
    seen.push(...found);
  }
  assert.deepEqual(seen.map((f) => f.name), ['Dal', 'Rice', '2 rotis']);
});

test('braces, brackets, quotes and backslashes inside text do not confuse it', () => {
  const tricky = JSON.stringify({
    understood: true,
    ask: 'not a food: {"items":[{"name":"fake"}]} ]}',
    items: [
      food({ name: 'Salad {house} [large]', portion: 'a "big" bowl \\ plate', assumed: 'ends with a brace }' }),
      food({ name: 'Soup' }),
    ],
  });
  for (const size of [1, 3, 7, tricky.length]) {
    const scanner = new FoodScanner();
    const seen = [];
    for (let i = 0; i < tricky.length; i += size) seen.push(...scanner.push(tricky.slice(i, i + size)));
    assert.deepEqual(seen.map((f) => f.name), ['Salad {house} [large]', 'Soup'], `piece size ${size}`);
    assert.equal(seen[0].portion, 'a "big" bowl \\ plate');
  }
});

test('nothing is reported for an answer with no foods, a food with no name, or text that is not an answer', () => {
  assert.deepEqual(new FoodScanner().push(JSON.stringify({ understood: false, ask: 'Add what the food was.', items: [] })), []);
  assert.deepEqual(new FoodScanner().push(JSON.stringify(plate([food({ name: '  ' })]))), []);
  assert.deepEqual(new FoodScanner().push('sorry, something went wrong }]}{'), []);
});

test('while the answer is still being written, a guessed food is flagged the same way', () => {
  const found = new FoodScanner().push(
    JSON.stringify(
      plate([
        food(),
        guessed({ name: 'Rice' }),
        guessed({ name: 'Water', calories: 0, protein: 0, carbs: 0, fat: 0 }),
        guessed({ name: 'Protein bar', numbers_from: 'client' }),
      ])
    )
  );
  assert.deepEqual(found.map((f) => [f.name, f.needs_amount]), [
    ['Dal', false],
    ['Rice', true],
    ['Water', false],
    ['Protein bar', false],
  ]);
});

test('progress text is cleaned the same way as the final text', () => {
  const dash = String.fromCharCode(0x2014);
  const [found] = new FoodScanner().push(JSON.stringify(plate([food({ portion: `1 katori ${dash} about 180 g` })])));
  assert.equal(found.portion, '1 katori, about 180 g');
});

test('a stream of events is split into messages, however it is cut up', () => {
  const stream =
    'event: response.created\ndata: {"type":"response.created"}\n\n' +
    ': a comment line\n\n' +
    'data: {"type":"response.output_text.delta","delta":"{\\"under"}\r\n\r\n' +
    'data: not json\n\n' +
    'data: [DONE]\n\n' +
    'data: {"type":"response.completed","response":{"status":"completed"}}\n\n';
  const expected = [
    { type: 'response.created' },
    { type: 'response.output_text.delta', delta: '{"under' },
    { type: 'response.completed', response: { status: 'completed' } },
  ];
  for (const size of [1, 5, 16, stream.length]) {
    const reader = new EventReader();
    const got = [];
    for (let i = 0; i < stream.length; i += size) got.push(...reader.push(stream.slice(i, i + size)));
    assert.deepEqual(got, expected, `piece size ${size}`);
  }
});

test('a whole streamed reply: foods along the way, then the same checked plate as without streaming', () => {
  // The reply as OpenAI streams it: the answer text in small pieces, then
  // the finished reply
  const pieces = sampleAnswer.match(/[\s\S]{1,9}/g);
  const finished = {
    status: 'completed',
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: sampleAnswer }] },
    ],
    usage: { input_tokens: 1500, output_tokens: 400 },
  };
  const stream =
    toEvent({ type: 'response.created', response: { status: 'in_progress' } }) +
    pieces.map((delta) => toEvent({ type: 'response.output_text.delta', delta })).join('') +
    toEvent({ type: 'response.completed', response: finished });

  const follower = new ReplyFollower();
  const reader = new EventReader();
  const live = [];
  for (let i = 0; i < stream.length; i += 37) {
    for (const message of reader.push(stream.slice(i, i + 37))) live.push(...follower.take(message));
  }

  assert.deepEqual(live.filter((e) => e.type === 'food').map((e) => e.food.name), ['Dal', 'Rice', '2 rotis']);
  assert.equal(follower.failed, false);
  const written = readOpenAIReply(follower.reply);
  assert.equal(written.ok, true);
  const outcome = readPlate(JSON.parse(written.text));
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.totals, { name: 'Dal, Rice, 2 rotis', calories: 600, protein: 20, carbs: 112, fat: 7.5 });
});

// ---------- label lookups on the web ----------

test('a web search is read from the stream, with its words once they are known', () => {
  assert.deepEqual(readLookup({ type: 'web_search_call', id: 'ws_1', status: 'in_progress' }, false), {
    id: 'ws_1',
    kind: 'search',
    text: '',
    done: false,
  });
  assert.deepEqual(
    readLookup(
      {
        type: 'web_search_call',
        id: 'ws_1',
        status: 'completed',
        action: {
          type: 'search',
          query: 'Epigamia Turbo Greek yoghurt nutrition',
          sources: [{ type: 'url', url: 'https://www.epigamia.com/products/turbo' }],
        },
      },
      true
    ),
    { id: 'ws_1', kind: 'search', text: 'Epigamia Turbo Greek yoghurt nutrition', done: true }
  );
  // The words can also come as a list, and are cleaned like any other text
  assert.equal(readLookup({ type: 'web_search_call', id: 'w', action: { type: 'search', queries: [7, 'Amul Taaza nutrition'] } }, true).text, 'Amul Taaza nutrition');
  const dash = String.fromCharCode(0x2014);
  assert.equal(readLookup({ type: 'web_search_call', id: 'w', action: { type: 'search', query: `Amul ${dash} Taaza` } }, true).text, 'Amul, Taaza');
});

test('a page the AI opens is reported by its site name', () => {
  assert.deepEqual(readLookup({ type: 'web_search_call', id: 'ws_3', action: { type: 'open_page', url: 'https://www.epigamia.com/x?y=1' } }, true), {
    id: 'ws_3',
    kind: 'page',
    text: 'epigamia.com',
    done: true,
  });
  assert.deepEqual(readLookup({ type: 'web_search_call', id: 'ws_4', action: { type: 'find_in_page', url: 'not a url', pattern: 'protein' } }, false), {
    id: 'ws_4',
    kind: 'page',
    text: '',
    done: false,
  });
  assert.equal(siteOf('https://shop.amul.com/en/product/taaza'), 'shop.amul.com');
  assert.equal(siteOf(null), '');
});

test('anything that is not a web search is not a lookup', () => {
  for (const bad of [null, 'x', {}, { type: 'message', id: 'm' }, { type: 'web_search_call' }, { type: 'web_search_call', id: '' }]) {
    assert.equal(readLookup(bad, true), null, JSON.stringify(bad));
  }
});

test('a streamed reply with a web search: the lookup as it starts and ends, then the foods', () => {
  const answer = JSON.stringify(
    plate([food({ name: 'Epigamia Turbo yoghurt', portion: '250 g', amount_from: 'client', numbers_from: 'label', calories: 163, protein: 30, carbs: 9, fat: 1, assumed: 'From the Epigamia label: 130 kcal, 24 g protein per 200 g.' })])
  );
  const call = { type: 'web_search_call', id: 'ws_9', status: 'completed', action: { type: 'search', query: 'Epigamia Turbo nutrition', sources: [{ type: 'url', url: 'https://www.epigamia.com/turbo' }, { type: 'url', url: 'https://www.bigbasket.com/pd/1' }] } };
  const finished = {
    status: 'completed',
    output: [{ type: 'reasoning', summary: [] }, call, { type: 'message', content: [{ type: 'output_text', text: answer }] }],
  };
  const messages = [
    { type: 'response.output_item.added', item: { type: 'reasoning', id: 'rs_1' } },
    { type: 'response.output_item.added', item: { type: 'web_search_call', id: 'ws_9', status: 'in_progress' } },
    { type: 'response.web_search_call.searching', item_id: 'ws_9' },
    { type: 'response.output_item.done', item: call },
    ...answer.match(/[\s\S]{1,11}/g).map((delta) => ({ type: 'response.output_text.delta', delta })),
    { type: 'response.completed', response: finished },
  ];
  const follower = new ReplyFollower();
  const live = messages.flatMap((message) => follower.take(message));
  assert.deepEqual(live.map((e) => e.type), ['lookup', 'lookup', 'food']);
  assert.deepEqual(live[0].lookup, { id: 'ws_9', kind: 'search', text: '', done: false });
  assert.deepEqual(live[1].lookup, { id: 'ws_9', kind: 'search', text: 'Epigamia Turbo nutrition', done: true });
  assert.equal(live[2].food.name, 'Epigamia Turbo yoghurt');
  assert.deepEqual(lookupsOf(follower.reply), { count: 1, sites: ['epigamia.com', 'bigbasket.com'] });
  const outcome = readPlate(JSON.parse(readOpenAIReply(follower.reply).text));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.items[0].numbers_from, 'label');
});

test('lookups are counted from the finished reply, sites once each', () => {
  assert.deepEqual(lookupsOf(null), { count: 0, sites: [] });
  assert.deepEqual(lookupsOf({ output: [{ type: 'message' }] }), { count: 0, sites: [] });
  const reply = {
    output: [
      { type: 'web_search_call', action: { type: 'search', sources: [{ url: 'https://a.com/1' }, { url: 'https://a.com/2' }, { url: 'bad' }] } },
      { type: 'web_search_call', action: { type: 'open_page', url: 'https://www.b.com/x' } },
      { type: 'web_search_call' },
    ],
  };
  assert.deepEqual(lookupsOf(reply), { count: 3, sites: ['a.com', 'b.com'] });
});

test('a stream that is cut off, or reports an error, never yields a plate', () => {
  const cutOff = new ReplyFollower();
  cutOff.take({ type: 'response.output_text.delta', delta: sampleAnswer.slice(0, 80) });
  assert.equal(cutOff.reply, null);

  const errored = new ReplyFollower();
  errored.take({ type: 'error', message: 'overloaded' });
  assert.equal(errored.failed, true);

  const incomplete = new ReplyFollower();
  incomplete.take({ type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } });
  assert.deepEqual(readOpenAIReply(incomplete.reply), { ok: false, why: 'incomplete: max_output_tokens' });

  // Things that are not events are ignored
  assert.deepEqual(new ReplyFollower().take(null), []);
  assert.deepEqual(new ReplyFollower().take('text'), []);
});
