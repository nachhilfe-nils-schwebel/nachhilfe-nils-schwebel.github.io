(() => {
  'use strict';

  const STORAGE_KEY = 'tutoring-trial-selection';

  function berlinClock() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    return { date: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')) };
  }

  function validate(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time || '')) return null;
    if (!['leipzig', 'online'].includes(value.format)) return null;
    const day = new Date(`${value.date}T12:00:00Z`);
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value.date) return null;
    const now = berlinClock();
    const daysAhead = (day.getTime() - new Date(`${now.date}T12:00:00Z`).getTime()) / 86400000;
    const [hour, minute] = value.time.split(':').map(Number);
    if (daysAhead < 0 || daysAhead > 31 || (daysAhead === 0 && hour * 60 + minute <= now.minutes)) return null;
    return { date: value.date, time: value.time, format: value.format, durationMinutes: 30, isDemo: true };
  }

  function clear() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* URL state works when storage is unavailable. */ }
    const url = new URL(window.location.href);
    for (const name of ['lessonDate', 'lessonTime', 'lessonFormat']) url.searchParams.delete(name);
    window.history.replaceState(null, '', url);
  }

  function read() {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get('direct') === '1') {
      clear();
      return null;
    }
    if (parameters.has('lessonDate') || parameters.has('lessonTime') || parameters.has('lessonFormat')) {
      return validate({ date: parameters.get('lessonDate'), time: parameters.get('lessonTime'), format: parameters.get('lessonFormat') });
    }
    try { return validate(JSON.parse(sessionStorage.getItem(STORAGE_KEY))); } catch { return null; }
  }

  function contactUrl(value) {
    const selection = validate(value);
    if (!selection) return null;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection)); } catch { /* Keep the selection in the navigation URL as well. */ }
    const url = new URL('contact.html', window.location.href);
    url.searchParams.set('lang', window.siteLanguage === 'en' ? 'en' : 'de');
    url.searchParams.set('lessonDate', selection.date);
    url.searchParams.set('lessonTime', selection.time);
    url.searchParams.set('lessonFormat', selection.format);
    return url.pathname + url.search;
  }

  window.LessonSelection = Object.freeze({ read, clear, validate, contactUrl });
})();
