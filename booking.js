(() => {
  'use strict';

  const TIME_ZONE = 'Europe/Berlin';
  const WEEK_COUNT = 4;

  // Civil dates are stored in UTC so day arithmetic stays independent of DST
  // and the visitor's timezone. Displayed lesson times always refer to Leipzig.
  const civilDate = key => new Date(`${key}T12:00:00Z`);
  const dateKey = date => date.toISOString().slice(0, 10);
  const addDays = (key, count) => {
    const date = civilDate(key);
    date.setUTCDate(date.getUTCDate() + count);
    return dateKey(date);
  };
  const berlinClock = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const value = type => parts.find(part => part.type === type).value;
    return {
      date: `${value('year')}-${value('month')}-${value('day')}`,
      minutes: Number(value('hour')) * 60 + Number(value('minute')),
    };
  };

  // Sample data source. Replace this provider with a calendar-backed source
  // later; rendering and selection below do not generate availability.
  const sampleAvailabilityProvider = Object.freeze({
    isDemo: true,
    timeZone: TIME_ZONE,
    durationMinutes: 30,
    getSlots(keys, now = new Date()) {
      const clock = berlinClock(now);
      const weeklyTimes = Object.freeze({
        1: ['15:30', '16:30', '18:00'],
        2: ['15:00', '16:00', '17:30'],
        4: ['15:30', '17:00', '18:00'],
        5: ['14:30', '15:30', '17:00'],
      });
      return Object.freeze(keys.flatMap(key => {
        if (key < clock.date) return [];
        const times = weeklyTimes[civilDate(key).getUTCDay()] || [];
        return times.filter(time => {
          const [hour, minute] = time.split(':').map(Number);
          return key > clock.date || hour * 60 + minute > clock.minutes;
        }).map(time => Object.freeze({ id: `${key}_${time}`, date: key, time }));
      }));
    },
  });

  const copy = {
    de: {
      skip: 'Zum Inhalt', back: 'Zurück zur Startseite',
      title: 'Kostenlose Probestunde',
      'demo.text': 'Beispieltermine. Die Kalenderanbindung folgt; es wird noch kein Termin gebucht.',
      'calendar.title': 'Termin auswählen', 'format.title': 'Unterrichtsformat',
      'format.leipzig': 'In Leipzig', 'format.online': 'Online',
      'date.title': 'Tag', 'time.title': 'Uhrzeit', timezone: 'Alle Zeiten: Leipzig (Europe/Berlin)',
      'summary.title': 'Dein Termin',
      'summary.duration.label': 'Dauer', 'summary.duration': '30 Minuten (Beispiel)',
      'summary.price.label': 'Preis', 'summary.price': 'Kostenlos', 'summary.format.label': 'Format',
      'summary.selection': 'Deine Auswahl',
      continue: 'Weiter zum Kontakt', expired: 'Diese Uhrzeit ist inzwischen vergangen. Bitte wähle einen neuen Termin.',
      previousWeek: 'Vorherige Woche', nextWeek: 'Nächste Woche', daysGroup: 'Tag auswählen',
      timesGroup: 'Uhrzeit auswählen', noSelection: 'Wähle einen Tag und eine Uhrzeit.',
      noSlots: 'In dieser Woche gibt es keine weiteren Beispielzeiten. Schau in die nächste Woche.',
      unavailable: 'Keine Beispielzeiten', available: 'Beispielzeiten zur Auswahl',
      titleTag: 'Kostenlose Probestunde · Nils Schwebel',
      description: 'Kostenlose Probestunde für Nachhilfe in Mathe und Physik, in Leipzig oder online. Entwurf mit Beispielterminen.',
    },
    en: {
      skip: 'Skip to content', back: 'Back to the homepage',
      title: 'Free trial lesson',
      'demo.text': 'Sample times. Calendar integration will follow; no lesson is booked here.',
      'calendar.title': 'Choose a time', 'format.title': 'Lesson format',
      'format.leipzig': 'In Leipzig', 'format.online': 'Online',
      'date.title': 'Day', 'time.title': 'Time', timezone: 'All times: Leipzig (Europe/Berlin)',
      'summary.title': 'Your lesson',
      'summary.duration.label': 'Duration', 'summary.duration': '30 minutes (example)',
      'summary.price.label': 'Price', 'summary.price': 'Free', 'summary.format.label': 'Format',
      'summary.selection': 'Your selection',
      continue: 'Continue to contact', expired: 'This time has now passed. Please choose a new time.',
      previousWeek: 'Previous week', nextWeek: 'Next week', daysGroup: 'Choose a day',
      timesGroup: 'Choose a time', noSelection: 'Choose a day and a time.',
      noSlots: 'There are no more sample times this week. Take a look at next week.',
      unavailable: 'No sample times', available: 'sample times to choose from',
      titleTag: 'Free trial lesson · Nils Schwebel',
      description: 'Free trial lesson for maths and physics tutoring, in Leipzig or online. Draft with sample times.',
    },
  };

  const clock = berlinClock();
  const mondayOffset = (civilDate(clock.date).getUTCDay() + 6) % 7;
  const startDate = addDays(clock.date, -mondayOffset);
  const allDates = Array.from({ length: WEEK_COUNT * 7 }, (_, index) => addDays(startDate, index));
  let slots = sampleAvailabilityProvider.getSlots(allDates);
  let language = window.siteLanguage === 'en' ? 'en' : 'de';
  let week = slots.length ? Math.floor(allDates.indexOf(slots[0].date) / 7) : 0;
  let selectedDate = slots[0]?.date || null;
  let selectedSlot = null;
  let format = 'leipzig';
  let selectionExpired = false;

  const get = id => document.getElementById(id);
  const t = key => copy[language][key] || key;
  const locale = () => language === 'en' ? 'en-GB' : 'de-DE';
  const formattedDate = (key, options) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', ...options }).format(civilDate(key));
  const formatName = () => t(`format.${format}`);
  const displayTime = time => language === 'de' ? `${time} Uhr` : time;
  const dateSlots = key => slots.filter(slot => slot.date === key);

  function applyCopy() {
    document.querySelectorAll('[data-booking-i18n]').forEach(element => {
      const value = t(element.dataset.bookingI18n);
      element.textContent = value;
    });
    document.title = t('titleTag');
    document.querySelector('meta[name="description"]').content = t('description');
    get('previous-week').setAttribute('aria-label', t('previousWeek'));
    get('next-week').setAttribute('aria-label', t('nextWeek'));
    get('booking-days').setAttribute('aria-label', t('daysGroup'));
    get('booking-times').setAttribute('aria-label', t('timesGroup'));
  }

  function renderDays() {
    const keys = allDates.slice(week * 7, week * 7 + 7);
    const first = formattedDate(keys[0], { day: 'numeric', month: 'short' });
    const last = formattedDate(keys[6], { day: 'numeric', month: 'short', year: 'numeric' });
    get('week-label').textContent = `${first} – ${last}`;
    get('previous-week').disabled = week === 0;
    get('next-week').disabled = week === WEEK_COUNT - 1;
    const buttons = keys.map(key => {
      const available = dateSlots(key);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'day-button';
      button.dataset.date = key;
      button.disabled = available.length === 0;
      button.setAttribute('aria-pressed', String(key === selectedDate));
      const fullDate = formattedDate(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      button.setAttribute('aria-label', `${fullDate}: ${available.length ? `${available.length} ${t('available')}` : t('unavailable')}`);
      const dayName = document.createElement('span');
      dayName.className = 'day-name';
      dayName.textContent = formattedDate(key, { weekday: 'short' }).replace('.', '').slice(0, 2);
      const dayNumber = document.createElement('span');
      dayNumber.className = 'day-number';
      dayNumber.textContent = formattedDate(key, { day: 'numeric' });
      button.append(dayName, dayNumber);
      return button;
    });
    get('booking-days').replaceChildren(...buttons);
  }

  function renderTimes() {
    const available = selectedDate ? dateSlots(selectedDate) : [];
    get('selected-day-label').textContent = selectedDate ? formattedDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    if (!available.length) {
      const note = document.createElement('p');
      note.className = 'no-slots';
      note.textContent = t('noSlots');
      get('booking-times').replaceChildren(note);
      return;
    }
    get('booking-times').replaceChildren(...available.map(slot => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'time-button';
      button.dataset.slot = slot.id;
      button.textContent = displayTime(slot.time);
      button.setAttribute('aria-pressed', String(selectedSlot?.id === slot.id));
      return button;
    }));
  }

  function renderSummary() {
    get('summary-format').textContent = formatName();
    get('selection-label').textContent = selectedSlot
      ? `${formattedDate(selectedSlot.date, { weekday: 'short', day: 'numeric', month: 'long' })} · ${displayTime(selectedSlot.time)}`
      : t('noSelection');
    get('booking-continue').disabled = !selectedSlot || !['leipzig', 'online'].includes(format);
    get('booking-error').hidden = !selectionExpired;
    get('booking-error').textContent = selectionExpired ? t('expired') : '';
  }

  function render() {
    applyCopy();
    renderDays();
    renderTimes();
    renderSummary();
  }

  function refreshAvailability() {
    slots = sampleAvailabilityProvider.getSlots(allDates);
    if (selectedSlot && !slots.some(slot => slot.id === selectedSlot.id)) {
      selectedSlot = null;
      selectionExpired = true;
    }
    if (!selectedDate || !dateSlots(selectedDate).length) {
      const keys = allDates.slice(week * 7, week * 7 + 7);
      selectedDate = keys.find(key => dateSlots(key).length) || null;
    }
    render();
  }

  function changeWeek(amount) {
    week = Math.max(0, Math.min(WEEK_COUNT - 1, week + amount));
    const keys = allDates.slice(week * 7, week * 7 + 7);
    selectedDate = keys.find(key => dateSlots(key).length) || null;
    selectedSlot = null;
    selectionExpired = false;
    renderDays();
    renderTimes();
    renderSummary();
  }

  get('previous-week').addEventListener('click', () => changeWeek(-1));
  get('next-week').addEventListener('click', () => changeWeek(1));
  get('booking-days').addEventListener('click', event => {
    const button = event.target.closest('button[data-date]');
    if (!button || button.disabled) return;
    selectedDate = button.dataset.date;
    selectedSlot = null;
    selectionExpired = false;
    renderDays();
    renderTimes();
    renderSummary();
    get('booking-days').querySelector(`[data-date="${selectedDate}"]`).focus();
  });
  get('booking-times').addEventListener('click', event => {
    const button = event.target.closest('button[data-slot]');
    if (!button) return;
    const slotId = button.dataset.slot;
    refreshAvailability();
    selectedSlot = slots.find(slot => slot.id === slotId) || null;
    selectionExpired = !selectedSlot;
    renderTimes();
    renderSummary();
    if (selectedSlot) get('booking-times').querySelector(`[data-slot="${selectedSlot.id}"]`).focus();
  });
  document.querySelectorAll('input[name="lesson-format"]').forEach(input => input.addEventListener('change', () => {
    format = input.value;
    renderSummary();
  }));
  get('booking-continue').addEventListener('click', () => {
    refreshAvailability();
    if (!selectedSlot) return;
    const destination = window.LessonSelection.contactUrl({ ...selectedSlot, format });
    if (destination) window.location.assign(destination);
    else {
      selectedSlot = null;
      selectionExpired = true;
      renderTimes();
      renderSummary();
    }
  });
  // Native buttons already support Tab, Enter and Space. Arrow keys additionally
  // make the seven-day and time groups quick to browse without trapping focus.
  ['booking-days', 'booking-times'].forEach(id => get(id).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...get(id).querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0 || !buttons.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }));
  document.addEventListener('languagechange', event => {
    language = event.detail.language === 'en' ? 'en' : 'de';
    render();
  });
  window.addEventListener('pageshow', refreshAvailability);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAvailability();
  });
  render();
})();
