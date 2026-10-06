const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const NOW = '2026-10-06T10:00:00.000Z';
const fixture = (overrides = {}) => ({
  schemaVersion: 1, status: 'ready', isDemo: false, timeZone: 'Europe/Berlin',
  durationMinutes: 45, stepMinutes: 15, generatedAt: NOW, validUntil: '2026-10-08T10:00:00.000Z',
  windowStart: '2026-10-05', windowEnd: '2026-11-02',
  slots: [{ date: '2026-10-06', time: '15:30' }, { date: '2026-10-06', time: '16:15' }, { date: '2026-10-07', time: '15:30' }],
  ...overrides
});
const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const reply = value => ({ ok: true, json: async () => value });

function browser(file, search = '') {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), {
    url: `https://example.test/${file}${search}`, runScripts: 'outside-only', pretendToBeVisual: true,
    virtualConsole: console
  });
  const w = dom.window;
  const NativeDate = w.Date;
  let timestamp = NativeDate.parse(NOW);
  w.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [timestamp])); }
    static now() { return timestamp; }
  };
  w.siteLanguage = 'de';
  w.contactConfig = { web3FormsAccessKey: '00000000-0000-0000-0000-000000000000' };
  const run = name => w.eval(fs.readFileSync(path.join(root, name), 'utf8'));
  return { dom, w, errors, run, advance: milliseconds => { timestamp += milliseconds; } };
}

test('schema validation rejects fabricated, malformed, duplicated and overlong snapshots', async t => {
  const b = browser('booking.html'); t.after(() => b.dom.window.close());
  b.w.fetch = async () => reply(fixture()); b.run('availability.js'); await flush();
  const validate = value => b.w.Availability.validate(value);
  assert.ok(validate(fixture()));
  for (const value of [
    fixture({ isDemo: true }), fixture({ timeZone: 'UTC' }), fixture({ durationMinutes: 30 }),
    fixture({ stepMinutes: 30 }), fixture({ status: 'example' }), fixture({ schemaVersion: 2 }),
    fixture({ windowStart: '2026-02-30' }), fixture({ windowEnd: '2026-11-03' }),
    fixture({ validUntil: '2026-10-09T10:00:00.000Z' }), fixture({ generatedAt: '2026-10-06T10:10:00.000Z' }),
    fixture({ generatedAt: '2026-02-30T10:00:00.000Z', validUntil: '2026-03-03T10:00:00.000Z' }),
    fixture({ slots: [{ date: '2026-10-06', time: '15:37' }] }),
    fixture({ slots: [{ date: '2026-11-02', time: '15:30' }] }),
    fixture({ slots: [{ date: '2026-10-06', time: '15:30' }, { date: '2026-10-06', time: '15:30' }] }),
    fixture({ status: 'unconfigured', generatedAt: null, validUntil: null }),
  ]) assert.equal(validate(value), null);
  assert.ok(validate(fixture({ status: 'unconfigured', generatedAt: null, validUntil: null, slots: [] })));
});

test('shared client deduplicates refreshes, filters past times and fails closed for stale/error data', async t => {
  const b = browser('booking.html'); t.after(() => b.dom.window.close());
  let calls = 0; let release;
  b.w.fetch = () => { calls += 1; return new Promise(resolve => { release = resolve; }); };
  b.run('availability.js');
  const one = b.w.Availability.refresh(); const two = b.w.Availability.refresh();
  assert.equal(one, two); await flush(); assert.equal(calls, 1);
  release(reply(fixture({ slots: [{ date: '2026-10-05', time: '15:30' }, { date: '2026-10-06', time: '11:45' }, { date: '2026-10-06', time: '15:30' }] })));
  await one;
  assert.equal(b.w.Availability.getSnapshot().slots.length, 1);
  assert.equal(b.w.Availability.contains({ date: '2026-10-06', time: '15:30' }), true);
  b.advance(48 * 3600000);
  assert.equal(b.w.Availability.getState().status, 'stale'); assert.equal(b.w.Availability.getSnapshot(), null);
  assert.equal(b.w.Availability.contains({ date: '2026-10-06', time: '15:30' }), false);
  b.w.fetch = () => { throw new Error('offline'); };
  await b.w.Availability.refresh(); assert.equal(b.w.Availability.getState().status, 'error');
  await b.w.Availability.refresh(); assert.equal(b.w.Availability.getState().status, 'error');
});

test('availability refreshes on visible polling, visibility and pageshow without polling hidden pages', async t => {
  const b = browser('booking.html'); t.after(() => b.dom.window.close());
  let calls = 0; let poll; let delay;
  b.w.setInterval = (callback, milliseconds) => { poll = callback; delay = milliseconds; return 0; };
  b.w.fetch = async (url, options) => {
    calls += 1; assert.equal(url, 'availability.json'); assert.equal(options.cache, 'no-store'); return reply(fixture());
  };
  b.run('availability.js'); await flush();
  assert.equal(delay, 60000);
  let before = calls;
  Object.defineProperty(b.w.document, 'hidden', { configurable: true, value: true });
  poll(); b.w.document.dispatchEvent(new b.w.Event('visibilitychange')); await flush();
  assert.equal(calls, before);
  Object.defineProperty(b.w.document, 'hidden', { configurable: true, value: false });
  b.w.document.dispatchEvent(new b.w.Event('visibilitychange')); await flush();
  assert.equal(calls, before + 1);
  before = calls; b.w.dispatchEvent(new b.w.Event('pageshow')); await flush(); assert.equal(calls, before + 1);
  before = calls; poll(); await flush(); assert.equal(calls, before + 1);
});

test('stale published data, malformed JSON and HTTP errors never produce bookable slots', async t => {
  const b = browser('booking.html'); t.after(() => b.dom.window.close());
  b.w.fetch = async () => reply(fixture({ generatedAt: '2026-10-04T10:00:00.000Z', validUntil: NOW }));
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('booking.js'); await flush();
  assert.equal(b.w.Availability.getState().status, 'stale');
  assert.equal(b.w.document.querySelectorAll('.time-button').length, 0);
  assert.equal(b.w.document.getElementById('booking-continue').disabled, true);
  for (const response of [
    { ok: true, json: async () => { throw new Error('bad JSON'); } },
    { ok: false, json: async () => fixture() },
    reply(fixture({ isDemo: true })),
  ]) {
    b.w.fetch = async () => response; await b.w.Availability.refresh();
    assert.equal(b.w.Availability.getState().status, 'error');
    assert.equal(b.w.document.querySelectorAll('.time-button').length, 0);
  }
});

test('unconfigured calendar shows no available booking times, with retry and direct contact', async t => {
  const b = browser('booking.html'); t.after(() => b.dom.window.close());
  b.w.fetch = async () => reply(fixture({ status: 'unconfigured', generatedAt: null, validUntil: null, slots: [] }));
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('booking.js'); await flush();
  assert.equal(b.w.document.querySelectorAll('.time-button').length, 0);
  assert.equal(b.w.document.getElementById('booking-continue').disabled, true);
  assert.match(b.w.document.getElementById('availability-status').textContent, /eingerichtet/);
  assert.equal(b.w.document.getElementById('availability-retry').hidden, false);
  assert.ok(b.w.document.querySelector('.availability-actions a[href*="direct=1"]'));
});

test('booking preserves available selections, clears removed selections and translates live labels', async t => {
  const b = browser('booking.html'); t.after(() => b.dom.window.close());
  let data = fixture(); b.w.fetch = async () => reply(data);
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('booking.js'); await flush();
  assert.equal(b.w.document.getElementById('booking-continue').disabled, true);
  b.w.document.querySelector('.time-button').click();
  assert.equal(b.w.document.getElementById('booking-continue').disabled, false);
  const url = b.w.LessonSelection.contactUrl({ date: '2026-10-06', time: '15:30', format: 'online' });
  assert.match(url, /lessonTime=15%3A30/); assert.match(url, /lessonFormat=online/);
  await b.w.Availability.refresh();
  assert.equal(b.w.document.getElementById('booking-continue').disabled, false);
  data = fixture({ slots: [{ date: '2026-10-06', time: '16:15' }] });
  await b.w.Availability.refresh();
  assert.equal(b.w.document.getElementById('booking-continue').disabled, true);
  assert.equal(b.w.document.getElementById('booking-error').hidden, false);
  assert.equal(b.w.LessonSelection.contactUrl({ date: '2026-10-06', time: '15:30', format: 'online' }), null);
  b.w.document.dispatchEvent(new b.w.CustomEvent('languagechange', { detail: { language: 'en' } }));
  assert.match(b.w.document.getElementById('booking-error').textContent, /no longer available/);
  assert.doesNotMatch(b.w.document.body.textContent, /sample times|Sample times/);
});

test('booking ignores an old continuation when selection changes during its refresh', async t => {
  const b = browser('booking.html'); t.after(() => b.dom.window.close());
  b.w.fetch = async () => reply(fixture());
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('booking.js'); await flush();
  b.w.document.querySelector('.time-button').click();
  let release; b.w.fetch = () => new Promise(resolve => { release = resolve; });
  b.w.document.getElementById('booking-continue').click(); await flush();
  assert.equal(b.w.document.getElementById('booking-continue').disabled, true);
  b.w.document.querySelectorAll('.time-button')[1].click();
  release(reply(fixture())); await flush();
  assert.match(b.w.document.getElementById('selection-label').textContent, /16:15/);
  assert.equal(b.errors.length, 0);
});

function fillContact(w) {
  w.document.getElementById('client-email').value = 'pupil@example.test';
  w.document.getElementById('client-message').value = 'Mathe, Klasse 8';
}
function submit(w) { w.document.getElementById('contact-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); }

test('direct contact submission works when the calendar cannot be fetched', async t => {
  const b = browser('contact.html', '?direct=1'); t.after(() => b.dom.window.close());
  let posts = 0;
  b.w.fetch = async (url, options) => {
    if (url === 'availability.json') throw new Error('offline');
    assert.equal(options.method, 'POST'); posts += 1; return reply({ success: true });
  };
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('contact.js'); await flush();
  assert.equal(b.w.document.getElementById('selected-lesson').hidden, true);
  assert.equal(b.w.document.getElementById('contact-send').textContent, 'Nachricht senden');
  fillContact(b.w); submit(b.w); await flush();
  assert.equal(posts, 1);
  assert.equal(b.w.document.getElementById('contact-status').textContent, 'Deine Nachricht wurde übermittelt.');
});

test('selected lesson requires a fresh membership check before Web3Forms submission', async t => {
  const b = browser('contact.html', '?lessonDate=2026-10-06&lessonTime=15%3A30&lessonFormat=online'); t.after(() => b.dom.window.close());
  let data = fixture(); let posts = 0; let payload;
  b.w.fetch = async (url, options) => {
    if (url === 'availability.json') return reply(data);
    posts += 1; payload = JSON.parse(options.body); return reply({ success: true });
  };
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('contact.js'); await flush();
  assert.equal(b.w.document.getElementById('selected-lesson').hidden, false);
  assert.equal(b.w.document.getElementById('contact-send').textContent, 'Anfrage senden');
  assert.doesNotMatch(b.w.document.body.textContent, /Beispieltermin/);
  fillContact(b.w);
  data = fixture({ slots: [] }); submit(b.w); await flush();
  assert.equal(posts, 0);
  assert.equal(b.w.document.getElementById('selected-lesson').hidden, true);
  assert.equal(b.w.document.getElementById('lesson-availability-notice').hidden, false);
  assert.equal(b.w.document.getElementById('contact-send').disabled, true);
  assert.match(b.w.document.getElementById('contact-status').textContent, /nicht mehr verfügbar/);
  data = fixture(); b.w.document.getElementById('lesson-availability-retry').click(); await flush();
  assert.equal(b.w.document.getElementById('selected-lesson').hidden, false);
  submit(b.w); await flush();
  assert.equal(posts, 1); assert.equal(payload.lesson_duration, '45 Minuten');
  assert.equal(payload.lesson_date, '2026-10-06'); assert.equal(payload.lesson_timezone, 'Europe/Berlin');
  assert.match(payload.lesson_note, /bestätige/);
  assert.match(b.w.document.getElementById('contact-status').textContent, /ob der Termin klappt/);
});

test('an unavailable selected lesson can be removed to send a direct enquiry', async t => {
  const b = browser('contact.html', '?lessonDate=2026-10-06&lessonTime=15%3A30&lessonFormat=leipzig'); t.after(() => b.dom.window.close());
  let posts = 0;
  b.w.fetch = async url => {
    if (url === 'availability.json') throw new Error('offline');
    posts += 1; return reply({ success: true });
  };
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('contact.js'); await flush();
  assert.equal(b.w.document.getElementById('contact-send').disabled, true);
  b.w.document.getElementById('lesson-without-time').click();
  assert.equal(b.w.document.getElementById('contact-send').disabled, false);
  assert.equal(b.w.document.getElementById('contact-send').textContent, 'Nachricht senden');
  assert.equal(b.w.LessonSelection.read(), null);
  fillContact(b.w); submit(b.w); await flush(); assert.equal(posts, 1);
});

for (const scenario of [
  { name: 'missing email and phone', email: '', phone: '', message: 'Help with maths', error: 'E-Mail-Adresse oder Telefonnummer' },
  { name: 'invalid email despite a valid phone', email: 'invalid-email', phone: '+49 123 456789', message: 'Help with maths', error: 'gültige E-Mail-Adresse' },
  { name: 'invalid phone despite a valid email', email: 'pupil@example.test', phone: 'Call me!', message: 'Help with maths', error: 'gültige Telefonnummer' },
  { name: 'phone with too few digits', email: '', phone: '12345', message: 'Help with maths', error: '6 bis 15 Ziffern' },
  { name: 'phone with too many digits', email: '', phone: '1234567890123456', message: 'Help with maths', error: '6 bis 15 Ziffern' },
  { name: 'blank message', email: 'pupil@example.test', phone: '', message: '   ', error: 'Bitte schreibe eine Nachricht' },
]) test(`contact validation prevents submitting ${scenario.name}`, async t => {
  const b = browser('contact.html', '?direct=1'); t.after(() => b.dom.window.close());
  let posts = 0;
  b.w.fetch = async url => {
    if (url === 'availability.json') return reply(fixture());
    posts += 1; return reply({ success: true });
  };
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('contact.js'); await flush();
  b.w.document.getElementById('client-email').value = scenario.email;
  b.w.document.getElementById('client-phone').value = scenario.phone;
  b.w.document.getElementById('client-message').value = scenario.message;
  submit(b.w); await flush();
  assert.equal(posts, 0);
  assert.match(b.w.document.querySelector('.contact-form').textContent, new RegExp(scenario.error));
  assert.equal(b.w.document.getElementById('client-message').value, scenario.message);
});

for (const scenario of [
  { name: 'email only', email: 'pupil@example.test', phone: '' },
  { name: 'phone only', email: '', phone: '+49 (123) 456-789' },
  { name: 'both contact methods', email: 'pupil@example.test', phone: '+49 (123) 456-789' },
]) test(`contact accepts ${scenario.name} and suppresses an unchanged duplicate submission`, async t => {
  const b = browser('contact.html', '?direct=1'); t.after(() => b.dom.window.close());
  let posts = 0; let payload;
  b.w.fetch = async (url, options) => {
    if (url === 'availability.json') return reply(fixture());
    posts += 1; payload = JSON.parse(options.body); return reply({ success: true });
  };
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('contact.js'); await flush();
  b.w.document.getElementById('client-email').value = scenario.email;
  b.w.document.getElementById('client-phone').value = scenario.phone;
  const message = b.w.document.getElementById('client-message'); message.value = 'Help with maths';
  submit(b.w); await flush();
  assert.equal(posts, 1); assert.equal(payload.phone, scenario.phone);
  assert.equal(payload.email, scenario.email || undefined); assert.equal(payload.lesson_date, undefined);
  assert.equal(b.w.document.getElementById('contact-send').disabled, true);
  submit(b.w); await flush(); assert.equal(posts, 1);
  message.value = 'Help with physics'; message.dispatchEvent(new b.w.Event('input'));
  assert.equal(b.w.document.getElementById('contact-send').disabled, false);
  submit(b.w); await flush(); assert.equal(posts, 2);
});

for (const scenario of [
  { name: 'an HTTP error', response: () => ({ ok: false, json: async () => ({ success: true }) }), expected: /konnte nicht übermittelt/ },
  { name: 'a rejected Web3Forms result', response: () => reply({ success: false }), expected: /konnte nicht übermittelt/ },
  { name: 'a malformed response', response: () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } }), expected: /nicht bestätigt/ },
  { name: 'a network failure', response: () => { throw new Error('offline'); }, expected: /nicht bestätigt/ },
]) test(`contact preserves fields and allows retry after ${scenario.name}`, async t => {
  const b = browser('contact.html', '?direct=1'); t.after(() => b.dom.window.close());
  let posts = 0;
  b.w.fetch = async url => {
    if (url === 'availability.json') return reply(fixture());
    posts += 1; return scenario.response();
  };
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('contact.js'); await flush();
  fillContact(b.w); submit(b.w); await flush();
  assert.equal(posts, 1);
  assert.match(b.w.document.getElementById('contact-status').textContent, scenario.expected);
  assert.equal(b.w.document.getElementById('contact-status').dataset.error, 'true');
  assert.equal(b.w.document.getElementById('client-email').value, 'pupil@example.test');
  assert.equal(b.w.document.getElementById('client-message').value, 'Mathe, Klasse 8');
  assert.equal(b.w.document.getElementById('contact-send').disabled, false);
});

test('contact prevents duplicate submits and freezes edits during selected lesson verification', async t => {
  const b = browser('contact.html', '?lessonDate=2026-10-06&lessonTime=15%3A30&lessonFormat=online'); t.after(() => b.dom.window.close());
  let posts = 0;
  b.w.fetch = async url => url === 'availability.json' ? reply(fixture()) : reply({ success: true });
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('contact.js'); await flush();
  fillContact(b.w);
  let release;
  b.w.fetch = async (url, options) => {
    if (url === 'availability.json') return new Promise(resolve => { release = resolve; });
    posts += 1; assert.equal(JSON.parse(options.body).lesson_time, '15:30'); return reply({ success: true });
  };
  submit(b.w); submit(b.w); await flush();
  assert.equal(posts, 0);
  for (const id of ['contact-send', 'client-email', 'client-phone', 'client-message', 'clear-lesson']) {
    assert.equal(b.w.document.getElementById(id).disabled, true);
  }
  release(reply(fixture())); await flush();
  assert.equal(posts, 1);
  assert.equal(b.w.document.getElementById('client-message').disabled, false);
  assert.match(b.w.document.getElementById('contact-status').textContent, /ob der Termin klappt/);
});

test('changing language preserves selected lesson and form values with translated labels', async t => {
  const b = browser('contact.html', '?lessonDate=2026-10-06&lessonTime=15%3A30&lessonFormat=online'); t.after(() => b.dom.window.close());
  b.w.fetch = async () => reply(fixture());
  b.run('availability.js'); b.run('lesson-selection.js'); b.run('contact.js'); await flush();
  fillContact(b.w);
  b.w.siteLanguage = 'en';
  b.w.document.dispatchEvent(new b.w.CustomEvent('languagechange', { detail: { language: 'en' } }));
  assert.equal(b.w.document.getElementById('contact-send').textContent, 'Send enquiry');
  assert.equal(b.w.document.getElementById('selected-lesson').hidden, false);
  assert.equal(b.w.document.getElementById('client-message').value, 'Mathe, Klasse 8');
  assert.match(b.w.document.getElementById('lesson-datetime').textContent, /Leipzig time/);
});
