(() => {
  'use strict';

  const TIME_ZONE = 'Europe/Berlin';
  const HOUR = 3600000;
  const civilDate = key => /^\d{4}-\d{2}-\d{2}$/.test(key || '') &&
    !Number.isNaN(Date.parse(`${key}T12:00:00Z`)) && new Date(`${key}T12:00:00Z`).toISOString().slice(0, 10) === key;
  const berlinClock = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const part = type => parts.find(item => item.type === type).value;
    return { date: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')) };
  };

  // This file accepts published free/busy results only. It never fabricates times
  // or exposes calendar event titles, participants, or descriptions to visitors.
  function validate(value, now = new Date()) {
    if (!value || value.schemaVersion !== 1 || !['ready', 'unconfigured'].includes(value.status) ||
        value.isDemo !== false || value.timeZone !== TIME_ZONE || value.durationMinutes !== 45 || value.stepMinutes !== 15 ||
        !civilDate(value.windowStart) || !civilDate(value.windowEnd) || !Array.isArray(value.slots)) return null;
    const windowDays = (Date.parse(`${value.windowEnd}T12:00:00Z`) - Date.parse(`${value.windowStart}T12:00:00Z`)) / 86400000;
    if (windowDays <= 0 || windowDays > 28 || value.slots.length > 1000) return null;
    if (value.status === 'unconfigured') {
      if (value.generatedAt !== null || value.validUntil !== null || value.slots.length) return null;
    } else {
      const isoInstant = instant => typeof instant === 'string' &&
        /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(instant) &&
        civilDate(instant.slice(0, 10)) && Number.isFinite(Date.parse(instant));
      if (!isoInstant(value.generatedAt) || !isoInstant(value.validUntil)) return null;
      const generated = Date.parse(value.generatedAt);
      const expires = Date.parse(value.validUntil);
      if (generated > now.getTime() + 5 * 60000 || expires <= generated || expires - generated > 48 * HOUR) return null;
    }
    const ids = new Set();
    const slots = [];
    for (const slot of value.slots) {
      if (!slot || !civilDate(slot.date) || slot.date < value.windowStart || slot.date >= value.windowEnd ||
          !/^([01]\d|2[0-3]):(?:00|15|30|45)$/.test(slot.time || '')) return null;
      const id = `${slot.date}_${slot.time}`;
      if (ids.has(id)) return null;
      ids.add(id);
      slots.push(Object.freeze({ id, date: slot.date, time: slot.time }));
    }
    slots.sort((left, right) => left.id.localeCompare(right.id));
    return Object.freeze({ ...value, slots: Object.freeze(slots) });
  }

  let data = null;
  let status = 'loading';
  let pending = null;
  function getState() {
    const expired = data?.status === 'ready' && Date.parse(data.validUntil) <= Date.now();
    return { status: expired ? 'stale' : status, snapshot: expired ? null : getSnapshot() };
  }
  function getSnapshot() {
    if (status !== 'ready' || !data || Date.parse(data.validUntil) <= Date.now()) return null;
    const clock = berlinClock();
    const slots = data.slots.filter(slot => {
      const [hour, minute] = slot.time.split(':').map(Number);
      return slot.date > clock.date || (slot.date === clock.date && hour * 60 + minute > clock.minutes);
    });
    return Object.freeze({ ...data, slots: Object.freeze(slots) });
  }
  function contains(selection) {
    return !!selection && !!getSnapshot()?.slots.some(slot => slot.date === selection.date && slot.time === selection.time);
  }
  const announce = () => document.dispatchEvent(new CustomEvent('availabilitychange', { detail: getState() }));

  function refresh() {
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('availability.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Availability request failed');
        const snapshot = validate(await response.json());
        if (!snapshot) throw new Error('Invalid availability data');
        data = snapshot;
        status = snapshot.status === 'unconfigured' ? 'unconfigured' : Date.parse(snapshot.validUntil) <= Date.now() ? 'stale' : 'ready';
      } catch {
        data = null;
        status = 'error';
      } finally {
        window.clearTimeout(timeout);
        pending = null;
        announce();
      }
      return getState();
    });
    return pending;
  }

  window.Availability = Object.freeze({ refresh, getState, getSnapshot, contains, validate, berlinClock });
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  refresh();
})();
