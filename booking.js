(() => {
  'use strict';

  const MAX_WEEK_COUNT = 4;

  // Civil dates are stored in UTC so day arithmetic stays independent of DST
  // and the visitor's timezone. Displayed lesson times always refer to Leipzig.
  const civilDate = key => new Date(`${key}T12:00:00Z`);
  const dateKey = date => date.toISOString().slice(0, 10);
  const addDays = (key, count) => {
    const date = civilDate(key);
    date.setUTCDate(date.getUTCDate() + count);
    return dateKey(date);
  };
  const copy = {
    de: {
      skip: 'Zum Inhalt', back: 'Zurück zur Startseite',
      title: 'Kostenlose Probestunde',
      'calendar.note': 'Die Termine werden regelmäßig aktualisiert. Ich bestätige deine Probestunde persönlich.',
      loading: 'Freie Termine werden geladen …',
      unconfigured: 'Freie Termine sind gerade nicht online verfügbar. Schreib mir, dann finden wir gemeinsam einen passenden Termin.',
      stale: 'Die Terminübersicht wird aktualisiert. Bitte versuche es später erneut oder schreib mir direkt.',
      error: 'Freie Termine können gerade nicht angezeigt werden. Bitte versuche es erneut oder schreib mir direkt.',
      retry: 'Erneut laden', contact: 'Zum Kontaktformular ↗',
      'calendar.title': 'Termin auswählen', 'format.title': 'Unterrichtsformat',
      'format.leipzig': 'In Leipzig', 'format.online': 'Online',
      'date.title': 'Tag', 'time.title': 'Uhrzeit',
      'summary.title': 'Dein Termin',
      'summary.duration.label': 'Dauer', 'summary.duration': '45 Minuten',
      'summary.price.label': 'Preis', 'summary.price': 'Kostenlos', 'summary.format.label': 'Format',
      'summary.selection': 'Deine Auswahl',
      continue: 'Weiter zum Kontakt', expired: 'Dieser Termin ist nicht mehr verfügbar. Bitte wähle einen neuen Termin.',
      previousWeek: 'Vorherige Woche', nextWeek: 'Nächste Woche', daysGroup: 'Tag auswählen',
      timesGroup: 'Uhrzeit auswählen', noSelection: 'Wähle einen Tag und eine Uhrzeit.',
      noSlots: 'In dieser Woche sind keine Termine frei. Schau in eine andere Woche oder schreib mir direkt.',
      unavailable: 'Keine freien Termine', available: 'freie Termine',
      titleTag: 'Kostenlose Probestunde · Nils Schwebel',
      description: 'Kostenlose Probestunde für Nachhilfe in Mathe und Physik, in Leipzig oder online.',
    },
    en: {
      skip: 'Skip to content', back: 'Back to the homepage',
      title: 'Free trial lesson',
      'calendar.note': 'Times are updated regularly. I’ll confirm your trial lesson personally.',
      loading: 'Loading available times …',
      unconfigured: 'Available times aren’t currently shown online. Contact me and we’ll find a suitable time together.',
      stale: 'The availability list is being updated. Please try again later or contact me directly.',
      error: 'Available times can’t currently be shown. Please try again or contact me directly.',
      retry: 'Try again', contact: 'Contact me ↗',
      'calendar.title': 'Choose a time', 'format.title': 'Lesson format',
      'format.leipzig': 'In Leipzig', 'format.online': 'Online',
      'date.title': 'Day', 'time.title': 'Time',
      'summary.title': 'Your lesson',
      'summary.duration.label': 'Duration', 'summary.duration': '45 minutes',
      'summary.price.label': 'Price', 'summary.price': 'Free', 'summary.format.label': 'Format',
      'summary.selection': 'Your selection',
      continue: 'Continue to contact', expired: 'This time is no longer available. Please choose a new time.',
      previousWeek: 'Previous week', nextWeek: 'Next week', daysGroup: 'Choose a day',
      timesGroup: 'Choose a time', noSelection: 'Choose a day and a time.',
      noSlots: 'There are no available times this week. Try another week or contact me directly.',
      unavailable: 'No available times', available: 'available times',
      titleTag: 'Free trial lesson · Nils Schwebel',
      description: 'Free trial lesson for maths and physics tutoring, in Leipzig or online.',
    },
  };

  let allDates = [];
  let slots = [];
  let language = window.siteLanguage === 'en' ? 'en' : 'de';
  let week = 0;
  let selectedDate = null;
  let selectedSlot = null;
  let format = 'leipzig';
  let selectionExpired = false;
  let checking = false;
  let revision = 0;
  const weekCount = () => Math.min(MAX_WEEK_COUNT, Math.ceil(allDates.length / 7));

  const get = id => document.getElementById(id);
  const t = key => copy[language][key] || key;
  const locale = () => language === 'en' ? 'en-GB' : 'de-DE';
  const formattedDate = (key, options) => new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', ...options }).format(civilDate(key));
  const formatName = () => t(`format.${format}`);
  const displayTime = time => language === 'de' ? `${time} Uhr` : time;
  const dateSlots = key => slots.filter(slot => slot.date === key);

  function calendarFocus() {
    const active = document.activeElement;
    if (active?.matches('#booking-days button[data-date]')) return { group: 'days', key: active.dataset.date };
    if (active?.matches('#booking-times button[data-slot]')) return { group: 'times', key: active.dataset.slot };
    return null;
  }

  function restoreCalendarFocus(previous) {
    if (!previous) return;
    const key = previous.group === 'days' ? 'date' : 'slot';
    const buttons = [...get(`booking-${previous.group}`).querySelectorAll('button:not(:disabled)')];
    // Recreated buttons should keep keyboard focus after polling or translation.
    // If that time disappears, focus the next available option without selecting it.
    let target = buttons.find(button => button.dataset[key] === previous.key)
      || buttons.find(button => button.dataset[key] > previous.key) || buttons[0];
    if (!target && previous.group === 'times') {
      const days = [...get('booking-days').querySelectorAll('button:not(:disabled)')];
      target = days.find(button => button.dataset.date >= previous.key.slice(0, 10)) || days[0];
    }
    if (!target) {
      const status = get('availability-status');
      const noSlots = get('booking-times').querySelector('.no-slots');
      target = !status.hidden ? status : noSlots && !noSlots.hidden ? noSlots : null;
      if (target) target.tabIndex = -1;
    }
    target?.focus({ preventScroll: true });
  }

  function applyCopy() {
    document.querySelectorAll('[data-booking-i18n]').forEach(element => {
      const value = t(element.dataset.bookingI18n);
      element.textContent = value;
    });
    document.title = t('titleTag');
    document.querySelector('meta[name="description"]').content = t('description');
    window.SiteMetadata?.update();
    get('previous-week').setAttribute('aria-label', t('previousWeek'));
    get('next-week').setAttribute('aria-label', t('nextWeek'));
    get('booking-days').setAttribute('aria-label', t('daysGroup'));
    get('booking-times').setAttribute('aria-label', t('timesGroup'));
  }

  function renderDays() {
    const keys = allDates.slice(week * 7, week * 7 + 7);
    if (!keys.length) {
      get('week-label').textContent = '';
      get('previous-week').disabled = true;
      get('next-week').disabled = true;
      get('booking-days').replaceChildren();
      return;
    }
    const first = formattedDate(keys[0], { day: 'numeric', month: 'short' });
    const last = formattedDate(keys[keys.length - 1], { day: 'numeric', month: 'short', year: 'numeric' });
    get('week-label').textContent = `${first} – ${last}`;
    get('previous-week').disabled = week === 0;
    get('next-week').disabled = week >= weekCount() - 1;
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
      note.textContent = window.Availability.getState().status === 'ready' ? t('noSlots') : '';
      note.hidden = !note.textContent;
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
    get('booking-continue').disabled = checking || !selectedSlot || !window.Availability.contains(selectedSlot) || !['leipzig', 'online'].includes(format);
    get('booking-error').hidden = !selectionExpired;
    get('booking-error').textContent = selectionExpired ? t('expired') : '';
  }

  function render() {
    const previousFocus = calendarFocus();
    applyCopy();
    const state = window.Availability.getState();
    get('availability-status').textContent = state.status === 'ready' ? '' : t(state.status);
    get('availability-status').hidden = state.status === 'ready';
    get('availability-retry').hidden = state.status === 'ready' || state.status === 'loading';
    get('availability-retry').disabled = checking;
    renderDays();
    renderTimes();
    renderSummary();
    restoreCalendarFocus(previousFocus);
  }

  function refreshAvailability() {
    const snapshot = window.Availability.getSnapshot();
    slots = snapshot?.slots || [];
    allDates = snapshot ? Array.from({ length: Math.min(28, (civilDate(snapshot.windowEnd) - civilDate(snapshot.windowStart)) / 86400000) }, (_, index) => addDays(snapshot.windowStart, index)) : [];
    if (selectedSlot && !slots.some(slot => slot.id === selectedSlot.id)) {
      selectedSlot = null;
      selectionExpired = true;
      revision += 1;
    }
    if (selectedDate && allDates.includes(selectedDate)) week = Math.floor(allDates.indexOf(selectedDate) / 7);
    else week = Math.max(0, Math.min(Math.max(0, weekCount() - 1), week));
    if (!selectedDate || !dateSlots(selectedDate).length) {
      const keys = allDates.slice(week * 7, week * 7 + 7);
      selectedDate = keys.find(key => dateSlots(key).length) || null;
    }
    render();
  }

  function changeWeek(amount) {
    revision += 1;
    week = Math.max(0, Math.min(Math.max(0, weekCount() - 1), week + amount));
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
    revision += 1;
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
    revision += 1;
    const slotId = button.dataset.slot;
    refreshAvailability();
    selectedSlot = slots.find(slot => slot.id === slotId) || null;
    selectionExpired = !selectedSlot;
    renderTimes();
    renderSummary();
    if (selectedSlot) get('booking-times').querySelector(`[data-slot="${selectedSlot.id}"]`).focus();
  });
  document.querySelectorAll('input[name="lesson-format"]').forEach(input => input.addEventListener('change', () => {
    revision += 1;
    format = input.value;
    renderSummary();
  }));
  get('availability-retry').addEventListener('click', async () => {
    checking = true;
    render();
    await window.Availability.refresh();
    checking = false;
    refreshAvailability();
  });
  get('booking-continue').addEventListener('click', async () => {
    if (checking || !selectedSlot) return;
    const attempt = { revision, id: selectedSlot.id, format };
    checking = true;
    renderSummary();
    await window.Availability.refresh();
    checking = false;
    refreshAvailability();
    if (attempt.revision !== revision || selectedSlot?.id !== attempt.id || format !== attempt.format) return;
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
  document.addEventListener('availabilitychange', refreshAvailability);
  refreshAvailability();
})();
