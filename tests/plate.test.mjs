/**
 * Tests for the app side of an analysed log: how the analyser's answer
 * becomes the rows that get logged, and how the "How this was worked out"
 * note is worded.
 *
 *   node --test tests/*.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressReader, foodsFromAnalysis, hasWorking, lookupLine, withLookup, workedOutLine } from '../utils/plate.ts';

const dal = {
  name: 'Dal',
  portion: '1 katori, about 180 g',
  assumed: 'Oil not mentioned, assumed 1 tsp.',
  numbers_from: 'estimate',
  calories: 190,
  protein: 10,
  carbs: 26,
  fat: 5,
};
const rice = { name: 'Rice', portion: '1 cup cooked', assumed: '', numbers_from: 'estimate', calories: 210, protein: 4, carbs: 46, fat: 0.5 };
const rotis = { name: '2 rotis', portion: '', assumed: '', numbers_from: 'estimate', calories: 200, protein: 6, carbs: 40, fat: 2 };

const totals = (items) => ({
  name: items.map((item) => item.name).join(', '),
  calories: items.reduce((sum, item) => sum + item.calories, 0),
  protein: items.reduce((sum, item) => sum + item.protein, 0),
  carbs: 0,
  fat: 0,
  items,
});

test('the original analyser (one total, no breakdown) still logs one row exactly as before', () => {
  const rows = foodsFromAnalysis({ name: '2 rotis, dal, rice', calories: 650, protein: 21, carbs: 110, fat: 12.04 }, ' dal rice roti ');
  assert.deepEqual(rows, [
    { name: '2 rotis, dal, rice', calories: 650, protein: 21, carbs: 110, fat: 12, description: 'dal rice roti' },
  ]);
  assert.equal('analysis' in rows[0], false);
});

test('one food logs as one row that keeps what the client typed, plus its note', () => {
  const rows = foodsFromAnalysis(totals([dal]), 'small dal tadka');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    name: 'Dal',
    calories: 190,
    protein: 10,
    carbs: 26,
    fat: 5,
    description: 'small dal tadka',
    analysis: {
      v: 1,
      portion: '1 katori, about 180 g',
      assumed: 'Oil not mentioned, assumed 1 tsp.',
      from: 'estimate',
      typed: 'small dal tadka',
    },
  });
});

test('a photo with no note falls back to the food name, and records nothing typed', () => {
  const [row] = foodsFromAnalysis(totals([dal]), '   ');
  assert.equal(row.description, 'Dal');
  assert.equal('typed' in row.analysis, false);
});

test('a plate becomes one row per food, in order, each saying which food and how much', () => {
  const rows = foodsFromAnalysis(totals([dal, rice, rotis]), 'dal, rice and 2 rotis');
  assert.deepEqual(rows.map((row) => row.name), ['Dal', 'Rice', '2 rotis']);
  assert.deepEqual(rows.map((row) => row.description), [
    'Dal (1 katori, about 180 g)',
    'Rice (1 cup cooked)',
    '2 rotis',
  ]);
  assert.deepEqual(rows.map((row) => [row.calories, row.protein]), [[190, 10], [210, 4], [200, 6]]);
  // Every row remembers the sentence it came from
  assert.deepEqual(rows.map((row) => row.analysis.typed), Array(3).fill('dal, rice and 2 rotis'));
  // Empty words are left out rather than saved as blanks
  assert.deepEqual(rows[2].analysis, { v: 1, from: 'estimate', typed: 'dal, rice and 2 rotis' });
});

test('the rows add up to what the foods add up to', () => {
  const rows = foodsFromAnalysis(totals([dal, rice, rotis]), 'dal, rice and 2 rotis');
  assert.equal(rows.reduce((sum, row) => sum + row.calories, 0), 600);
  assert.equal(rows.reduce((sum, row) => sum + row.protein, 0), 20);
});

test('unknown carbs and fat stay unknown, never zero', () => {
  const odd = [
    { ...dal, carbs: null, fat: undefined },
    { ...rice, carbs: -3, fat: 12000 },
    { ...rotis, carbs: Number.NaN, fat: '2' },
    { ...dal, name: 'Curd', carbs: 4.44, fat: 0 },
  ];
  const rows = foodsFromAnalysis(totals(odd), 'x');
  assert.deepEqual(rows.map((row) => [row.carbs, row.fat]), [[null, null], [null, null], [null, null], [4.4, 0]]);
});

test('numbers the client typed are marked as theirs', () => {
  const bar = { name: 'Protein bar', portion: '1 bar', assumed: '', numbers_from: 'client', calories: 196, protein: 22, carbs: 18, fat: 7 };
  const [row] = foodsFromAnalysis(totals([bar]), 'protein bar (196 kcal, 22gm protein)');
  assert.equal(row.analysis.from, 'client');
  assert.deepEqual([row.calories, row.protein], [196, 22]);
});

test('numbers from a label are marked as from the label', () => {
  const yoghurt = {
    name: 'Epigamia Turbo yoghurt',
    portion: '250 g',
    assumed: 'From the Epigamia label: 130 kcal, 24 g protein per 200 g.',
    numbers_from: 'label',
    calories: 163,
    protein: 30,
    carbs: 9,
    fat: 1,
  };
  const [row] = foodsFromAnalysis(totals([yoghurt]), '250 g epigamia turbo');
  assert.equal(row.analysis.from, 'label');
  assert.equal(workedOutLine(row.analysis), '250 g. From the Epigamia label: 130 kcal, 24 g protein per 200 g.');
});

test('a very long note is capped where it is kept with the row', () => {
  const [row] = foodsFromAnalysis(totals([dal]), 'x'.repeat(900));
  assert.equal(row.analysis.typed.length, 500);
  // What the client typed is still the description, in full
  assert.equal(row.description.length, 900);
});

test('the worked-out line reads as plain sentences', () => {
  assert.equal(
    workedOutLine({ v: 1, portion: '1 katori, about 180 g', assumed: 'Oil not mentioned, assumed 1 tsp.', from: 'estimate' }),
    '1 katori, about 180 g. Oil not mentioned, assumed 1 tsp.'
  );
  assert.equal(workedOutLine({ v: 1, portion: 'about 40 g each', from: 'estimate' }), 'About 40 g each.');
  assert.equal(
    workedOutLine({ v: 1, portion: '1 bar', from: 'client' }),
    '1 bar. Used the numbers you typed.'
  );
  assert.equal(workedOutLine({ v: 1, assumed: 'size not given, assumed 1 medium bowl', from: 'estimate' }), 'Size not given, assumed 1 medium bowl.');
});

test('nothing to say means no line at all', () => {
  for (const empty of [null, undefined, {}, { v: 1, from: 'estimate' }, { v: 1, portion: '  ', assumed: '' }, 'text']) {
    assert.equal(workedOutLine(empty), null, JSON.stringify(empty));
  }
});

test('shortcuts and older rows have no working to show', () => {
  assert.equal(hasWorking({ analysis: null }), false);
  assert.equal(hasWorking({}), false);
  assert.equal(hasWorking({ analysis: { v: 1, portion: '1 cup', from: 'estimate' } }), true);
});

test('no em or en dashes in anything this writes for a client to read', () => {
  const rows = foodsFromAnalysis(totals([dal, rice, rotis]), 'dal, rice and 2 rotis');
  const words = rows.flatMap((row) => [row.description, workedOutLine(row.analysis) ?? '']).join(' ');
  assert.equal(/[‒-―]/.test(words + workedOutLine({ v: 1, portion: '1 bar', from: 'client' })), false);
});

// ---------- the analyser's progress, as the app reads it ----------

test('the app reads the progress the server sends, however the stream is cut up', async () => {
  const { toEvent } = await import('../supabase/functions/analyze-food-v2/stream.ts');
  const result = totals([dal, rice]);
  const sent = [
    { type: 'start' },
    { type: 'lookup', id: 'ws_1', kind: 'search', text: '', done: false },
    { type: 'lookup', id: 'ws_1', kind: 'search', text: 'Epigamia Turbo nutrition', done: true },
    { type: 'food', name: 'Dal', portion: '1 katori, about 180 g', assumed: 'Oil not mentioned, assumed 1 tsp.' },
    { type: 'food', name: 'Rice', portion: '1 cup cooked', assumed: '' },
    { type: 'done', result },
  ];
  const stream = sent.map(toEvent).join('');
  for (const size of [1, 4, 33, stream.length]) {
    const reader = new ProgressReader();
    const got = [];
    for (let i = 0; i < stream.length; i += size) got.push(...reader.push(stream.slice(i, i + size)));
    assert.deepEqual(got, sent, `piece size ${size}`);
  }
});

// ---------- label lookups in the working view ----------

test('a lookup is added once, then filled in and marked done', () => {
  let lookups = withLookup([], { id: 'a', kind: 'search', text: '', done: false });
  lookups = withLookup(lookups, { id: 'b', kind: 'search', text: 'Amul Taaza nutrition', done: false });
  lookups = withLookup(lookups, { id: 'a', kind: 'search', text: 'Epigamia Turbo nutrition', done: true });
  assert.deepEqual(lookups, [
    { id: 'a', kind: 'search', text: 'Epigamia Turbo nutrition', done: true },
    { id: 'b', kind: 'search', text: 'Amul Taaza nutrition', done: false },
  ]);
  // A later report with no words keeps the words, and done stays done
  lookups = withLookup(lookups, { id: 'a', kind: 'search', text: '', done: false });
  assert.deepEqual(lookups[0], { id: 'a', kind: 'search', text: 'Epigamia Turbo nutrition', done: true });
  // A lookup that turns out to be a page read takes the site's name
  lookups = withLookup(lookups, { id: 'b', kind: 'page', text: 'amul.com', done: true });
  assert.deepEqual(lookups[1], { id: 'b', kind: 'page', text: 'amul.com', done: true });
});

test('each lookup reads as a plain line, while running and once done', () => {
  assert.equal(lookupLine({ id: 'a', kind: 'search', text: 'Epigamia Turbo nutrition', done: false }), 'Looking up Epigamia Turbo nutrition');
  assert.equal(lookupLine({ id: 'a', kind: 'search', text: 'Epigamia Turbo nutrition', done: true }), 'Looked up Epigamia Turbo nutrition');
  assert.equal(lookupLine({ id: 'a', kind: 'search', text: '  ', done: false }), 'Searching online');
  assert.equal(lookupLine({ id: 'a', kind: 'search', text: '', done: true }), 'Searched online');
  assert.equal(lookupLine({ id: 'b', kind: 'page', text: 'epigamia.com', done: false }), 'Reading epigamia.com');
  assert.equal(lookupLine({ id: 'b', kind: 'page', text: 'epigamia.com', done: true }), 'Read epigamia.com');
  assert.equal(lookupLine({ id: 'b', kind: 'page', text: '', done: true }), 'Read a page online');
  const all = [true, false].flatMap((done) =>
    ['search', 'page'].flatMap((kind) => ['', 'x'].map((text) => lookupLine({ id: 'z', kind, text, done })))
  );
  assert.equal(/[‒-―]/.test(all.join(' ')), false);
});

test('a failure arrives as a message too, and anything unreadable is skipped', () => {
  const reader = new ProgressReader();
  const got = reader.push(
    'data: not json\n\n' +
      ': keep-alive\n\n' +
      'data: {"no":"type"}\n\n' +
      'data: {"type":"error","status":422,"message":"Add what the food was."}\n\n'
  );
  assert.deepEqual(got, [{ type: 'error', status: 422, message: 'Add what the food was.' }]);
});
