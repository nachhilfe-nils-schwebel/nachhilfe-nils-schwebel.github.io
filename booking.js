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
      eyebrow: 'Die erste Stunde geht auf mich', title: 'Lernen wir uns kennen.',
      intro: 'Eine kostenlose Probestunde, um Fragen zu stellen, Ziele zu besprechen und herauszufinden, ob es passt.',
      'demo.label': 'Terminübersicht · Vorschau',
      'demo.text': 'Die Zeiten sind Beispiele. Die Kalenderanbindung folgt; hier wird noch kein Termin reserviert.',
      'calendar.title': 'Finde deine Probestunde', 'format.title': 'Wo möchtest du lernen?',
      'format.leipzig': 'In Leipzig', 'format.leipzig.note': 'Gemeinsam vor Ort',
      'format.online': 'Online', 'format.online.note': 'Bequem von zu Hause',
      'date.title': 'Welcher Tag passt dir?', 'date.key': 'Tag mit Beispielzeiten',
      'time.title': 'Und welche Uhrzeit?', timezone: 'Alle Zeiten: Leipzig (Europe/Berlin)',
      'summary.eyebrow': 'Ein guter Anfang', 'summary.title': 'Ganz in Ruhe.\nGanz ohne Druck.',
      'summary.intro': 'Wir schauen gemeinsam, wo du gerade stehst und wie ich dich unterstützen kann.',
      'summary.duration.label': 'Dauer', 'summary.duration': '30 Minuten (Beispiel)',
      'summary.price.label': 'Preis', 'summary.price': 'Kostenlos', 'summary.format.label': 'Format',
      'summary.selection': 'Deine Auswahl', 'summary.review': 'Auswahl ansehen',
      'summary.note': 'Unverbindliche Vorschau · Keine Buchung',
      parents: 'Eltern sind beim ersten Kennenlernen selbstverständlich willkommen.',
      'review.eyebrow': 'Deine Beispielauswahl', 'review.title': 'So könnte dein Start aussehen.',
      'review.note': 'Das ist eine Vorschau. Es wurde kein Termin gebucht und es wurden keine Kontaktdaten erfasst. Sobald der Kalender angebunden ist, kannst du hier eine echte Probestunde reservieren.',
      'review.reset': 'Andere Zeit ansehen ←',
      previousWeek: 'Vorherige Woche', nextWeek: 'Nächste Woche', daysGroup: 'Tag auswählen',
      timesGroup: 'Uhrzeit auswählen', noSelection: 'Wähle einen Tag und eine Uhrzeit.',
      chooseTime: 'Bitte wähle noch eine Uhrzeit aus.', chooseDay: 'Bitte wähle einen Tag mit Beispielzeiten aus.',
      noSlots: 'In dieser Woche gibt es keine weiteren Beispielzeiten. Schau in die nächste Woche.',
      unavailable: 'Keine Beispielzeiten', available: 'Beispielzeiten zur Auswahl', timeSuffix: 'Uhr',
      titleTag: 'Kostenlose Probestunde · Nils Schwebel',
      description: 'Lerne Nils in einer kostenlosen Probestunde kennen. Entwurf mit Beispielterminen für Nachhilfe in Leipzig und online.',
    },
    en: {
      skip: 'Skip to content', back: 'Back to the homepage',
      eyebrow: 'The first lesson is on me', title: 'Let’s get to know each other.',
      intro: 'A free trial lesson to ask questions, talk about your goals and see whether we’re a good fit.',
      'demo.label': 'Lesson times · Preview',
      'demo.text': 'These are sample times. Calendar integration is coming later; no appointment is reserved here.',
      'calendar.title': 'Find your trial lesson', 'format.title': 'Where would you like to learn?',
      'format.leipzig': 'In Leipzig', 'format.leipzig.note': 'Together in person',
      'format.online': 'Online', 'format.online.note': 'From the comfort of home',
      'date.title': 'Which day works for you?', 'date.key': 'Day with sample times',
      'time.title': 'And what time?', timezone: 'All times: Leipzig (Europe/Berlin)',
      'summary.eyebrow': 'A good beginning', 'summary.title': 'Take your time.\nNo pressure.',
      'summary.intro': 'We’ll look at where you are right now and how I can help you move forward.',
      'summary.duration.label': 'Duration', 'summary.duration': '30 minutes (example)',
      'summary.price.label': 'Price', 'summary.price': 'Free', 'summary.format.label': 'Format',
      'summary.selection': 'Your selection', 'summary.review': 'Review selection',
      'summary.note': 'Preview only · No booking',
      parents: 'Parents are of course welcome to join our first meeting.',
      'review.eyebrow': 'Your sample selection', 'review.title': 'This could be your first step.',
      'review.note': 'This is a preview. No appointment has been booked and no contact details have been collected. Once the calendar is connected, you’ll be able to reserve a real trial lesson here.',
      'review.reset': 'Explore another time ←',
      previousWeek: 'Previous week', nextWeek: 'Next week', daysGroup: 'Choose a day',
      timesGroup: 'Choose a time', noSelection: 'Choose a day and a time.',
      chooseTime: 'Please choose a time first.', chooseDay: 'Please choose a day with sample times.',
      noSlots: 'There are no more sample times this week. Take a look at next week.',
      unavailable: 'No sample times', available: 'sample times to choose from', timeSuffix: '',
      titleTag: 'Free trial lesson · Nils Schwebel',
      description: 'Meet Nils in a free trial lesson. Draft with sample times for private tutoring in Leipzig and online.',
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
  let feedbackKey = null;
  let reviewVisible = false;

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
      // A deliberate line break in the summary heading; translation stays text.
      element.replaceChildren(...value.split('\n').flatMap((line, index) => index ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
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
      dayName.textContent = formattedDate(key, { weekday: 'short' }).replace('.', '');
      const dayNumber = document.createElement('span');
      dayNumber.className = 'day-number';
      dayNumber.textContent = formattedDate(key, { day: 'numeric' });
      const dot = document.createElement('span');
      dot.className = 'day-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.append(dayName, dayNumber, dot);
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
    get('selection-feedback').textContent = feedbackKey ? t(feedbackKey) : '';
    get('demo-review').hidden = !reviewVisible;
    if (selectedSlot) {
      get('review-details').textContent = `${formattedDate(selectedSlot.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${displayTime(selectedSlot.time)} · ${formatName()} · ${t('summary.duration')} · ${t('summary.price')}`;
    }
  }

  function render() {
    applyCopy();
    renderDays();
    renderTimes();
    renderSummary();
  }

  function hideReview() {
    reviewVisible = false;
    feedbackKey = null;
  }

  function changeWeek(amount) {
    week = Math.max(0, Math.min(WEEK_COUNT - 1, week + amount));
    const keys = allDates.slice(week * 7, week * 7 + 7);
    selectedDate = keys.find(key => dateSlots(key).length) || null;
    selectedSlot = null;
    hideReview();
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
    hideReview();
    renderDays();
    renderTimes();
    renderSummary();
    get('booking-days').querySelector(`[data-date="${selectedDate}"]`).focus();
  });
  get('booking-times').addEventListener('click', event => {
    const button = event.target.closest('button[data-slot]');
    if (!button) return;
    selectedSlot = slots.find(slot => slot.id === button.dataset.slot) || null;
    hideReview();
    renderTimes();
    renderSummary();
    get('booking-times').querySelector(`[data-slot="${selectedSlot.id}"]`).focus();
  });
  document.querySelectorAll('input[name="lesson-format"]').forEach(input => input.addEventListener('change', () => {
    format = input.value;
    hideReview();
    renderSummary();
  }));
  get('review-selection').addEventListener('click', () => {
    // Recheck time immediately before reviewing, including on long-lived tabs.
    slots = sampleAvailabilityProvider.getSlots(allDates);
    if (selectedSlot && !slots.some(slot => slot.id === selectedSlot.id)) {
      selectedSlot = null;
      selectedDate = slots[0]?.date || null;
      if (selectedDate) week = Math.floor(allDates.indexOf(selectedDate) / 7);
      renderDays();
      renderTimes();
    }
    if (!selectedSlot) {
      feedbackKey = selectedDate ? 'chooseTime' : 'chooseDay';
      renderSummary();
      (get('booking-times').querySelector('button') || get('booking-days').querySelector('button:not(:disabled)') || get('next-week')).focus();
      return;
    }
    feedbackKey = null;
    reviewVisible = true;
    renderSummary();
    get('demo-review').focus({ preventScroll: true });
    get('demo-review').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  });
  get('reset-selection').addEventListener('click', () => {
    selectedSlot = null;
    hideReview();
    renderTimes();
    renderSummary();
    (get('booking-times').querySelector('button') || get('next-week')).focus();
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
  render();
})();
