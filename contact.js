(() => {
  'use strict';

  // Add the Web3Forms access key in contact-config.js before publication.
  window.contactConfig = {
    web3FormsAccessKey: '',
    ...window.contactConfig
  };

  const copy = {
    de: {
      skip: 'Zum Inhalt', back: 'Zurück zur Startseite', title: 'Kontakt',
      intro: 'Schreib mir, wobei du Unterstützung in Mathe oder Physik suchst. Du kannst auch ohne Probestunde anfragen.',
      'details.title': 'Wie kann ich dich erreichen?',
      'details.hint': 'E-Mail-Adresse oder Telefonnummer – mindestens eines der Felder ausfüllen.',
      email: 'E-Mail-Adresse', phone: 'Telefonnummer', message: 'Deine Nachricht', send: 'Nachricht senden',
      'lesson.title': 'Deine Probestunde', 'lesson.format.label': 'Format',
      'lesson.format.leipzig': 'In Leipzig', 'lesson.format.online': 'Online',
      'lesson.duration.label': 'Dauer', 'lesson.duration': '30 Minuten (Beispiel)',
      'lesson.price.label': 'Preis', 'lesson.price': 'Kostenlos',
      'lesson.note': 'Beispieltermin, noch keine Buchung. Die Kalenderanbindung folgt.',
      'lesson.change': 'Termin ändern', 'lesson.clear': 'Ohne Termin anfragen',
      'delivery.unconfigured': 'Entwurf: Der Nachrichtenversand ist noch nicht eingerichtet. Es werden noch keine Nachrichten verschickt.',
      'delivery.configured': 'Deine Anfrage wird über das Kontaktformular übermittelt.',
      'validation.contact': 'Bitte gib eine E-Mail-Adresse oder Telefonnummer an.',
      'validation.email': 'Bitte gib eine gültige E-Mail-Adresse an.',
      'validation.phone': 'Bitte gib eine gültige Telefonnummer mit 6 bis 15 Ziffern an.',
      'validation.message': 'Bitte schreibe eine Nachricht.',
      'status.unconfigured': 'Der Nachrichtenversand ist noch nicht eingerichtet. Deine Angaben bleiben im Formular erhalten; es wurde nichts verschickt.',
      'status.sending': 'Deine Anfrage wird übermittelt …',
      'status.submitted': 'Deine Anfrage wurde übermittelt.',
      'status.submittedLesson': 'Deine Anfrage wurde übermittelt. Die Probestunde ist erst nach persönlicher Bestätigung vereinbart.',
      'status.failed': 'Deine Anfrage konnte nicht übermittelt werden. Deine Angaben bleiben im Formular erhalten. Bitte versuche es erneut.',
      'status.uncertain': 'Die Übermittlung konnte nicht bestätigt werden. Deine Angaben bleiben im Formular. Bitte warte kurz, bevor du es erneut versuchst, damit keine doppelte Anfrage entsteht.',
      'status.expired': 'Der gewählte Beispieltermin ist nicht mehr gültig. Wähle einen neuen Termin oder sende deine Anfrage ohne Probestunde.',
      subject: 'Anfrage zur Nachhilfe',
      'meta.description': 'Frag Nils Schwebel nach Nachhilfe in Mathematik und Physik für die Klassen 5–12, in Leipzig oder online.'
    },
    en: {
      skip: 'Skip to content', back: 'Back to home', title: 'Contact',
      intro: 'Tell me where you need support in maths or physics. You can also get in touch without a trial lesson.',
      'details.title': 'How can I reach you?',
      'details.hint': 'Email address or phone number – fill in at least one of these fields.',
      email: 'Email address', phone: 'Phone number', message: 'Your message', send: 'Send message',
      'lesson.title': 'Your trial lesson', 'lesson.format.label': 'Format',
      'lesson.format.leipzig': 'In Leipzig', 'lesson.format.online': 'Online',
      'lesson.duration.label': 'Duration', 'lesson.duration': '30 minutes (example)',
      'lesson.price.label': 'Price', 'lesson.price': 'Free',
      'lesson.note': 'Sample time, no booking yet. Calendar integration will follow.',
      'lesson.change': 'Change time', 'lesson.clear': 'Contact without a lesson',
      'delivery.unconfigured': 'Draft: Message delivery is not configured yet. No messages will be sent.',
      'delivery.configured': 'Your enquiry will be submitted through the contact form.',
      'validation.contact': 'Please enter an email address or phone number.',
      'validation.email': 'Please enter a valid email address.',
      'validation.phone': 'Please enter a valid phone number with 6 to 15 digits.',
      'validation.message': 'Please write a message.',
      'status.unconfigured': 'Message delivery is not configured yet. Your details remain in the form; nothing has been sent.',
      'status.sending': 'Submitting your enquiry …',
      'status.submitted': 'Your enquiry was submitted.',
      'status.submittedLesson': 'Your enquiry was submitted. A trial lesson is only arranged after personal confirmation.',
      'status.failed': 'Your enquiry could not be submitted. Your details remain in the form. Please try again.',
      'status.uncertain': 'Submission could not be confirmed. Your details remain in the form. Please wait a little before trying again to avoid a duplicate enquiry.',
      'status.expired': 'The selected sample time is no longer valid. Choose a new time or send your enquiry without a trial lesson.',
      subject: 'Tutoring enquiry',
      'meta.description': 'Contact Nils Schwebel about maths and physics tutoring for pupils in grades 5–12, in Leipzig or online.'
    }
  };

  const form = document.getElementById('contact-form');
  const email = document.getElementById('client-email');
  const phone = document.getElementById('client-phone');
  const message = document.getElementById('client-message');
  const contactError = document.getElementById('contact-error');
  const messageError = document.getElementById('message-error');
  const status = document.getElementById('contact-status');
  const send = document.getElementById('contact-send');
  const lessonCard = document.getElementById('selected-lesson');
  let lesson = window.LessonSelection?.read() || null;
  let validationShown = false;
  let statusKey = null;
  let sending = false;
  let submittedFingerprint = null;

  const language = () => window.siteLanguage === 'en' ? 'en' : 'de';
  const translate = key => copy[language()][key];

  function accessKey() {
    const key = window.contactConfig.web3FormsAccessKey;
    return typeof key === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(key.trim()) ? key.trim() : null;
  }

  function lessonDateLabel() {
    if (!lesson) return '';
    // The date and time already describe Leipzig wall-clock time, not the visitor's timezone.
    const date = new Date(`${lesson.date}T12:00:00Z`);
    const day = new Intl.DateTimeFormat(language() === 'de' ? 'de-DE' : 'en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin'
    }).format(date);
    return `${day}, ${lesson.time}${language() === 'de' ? ' Uhr · Leipziger Zeit' : ' · Leipzig time'}`;
  }

  function renderLesson() {
    lessonCard.hidden = !lesson;
    if (!lesson) return;
    document.getElementById('lesson-datetime').textContent = lessonDateLabel();
    document.getElementById('lesson-format').textContent = translate(`lesson.format.${lesson.format}`);
  }

  function refreshLesson() {
    const previous = lesson;
    lesson = window.LessonSelection?.read() || null;
    renderLesson();
    updateSendButton();
    if (previous && !lesson) {
      showStatus('status.expired', true);
      return false;
    }
    return true;
  }

  function requestFingerprint() {
    return JSON.stringify({ email: email.value.trim(), phone: phone.value.trim(), message: message.value.trim(), lesson });
  }

  function updateSendButton() {
    send.disabled = sending || submittedFingerprint === requestFingerprint();
    [email, phone, message, document.getElementById('clear-lesson')].forEach(input => {
      input.disabled = sending;
    });
  }

  function updateValidation(showErrors = validationShown) {
    email.setCustomValidity('');
    phone.setCustomValidity('');
    message.setCustomValidity('');
    const missingContact = !email.value.trim() && !phone.value.trim();
    const invalidEmail = !!email.value.trim() && email.validity.typeMismatch;
    const digits = phone.value.replace(/\D/g, '');
    const invalidPhone = !!phone.value.trim() && (!/^[+\d\s()./\-]+$/.test(phone.value.trim()) || digits.length < 6 || digits.length > 15);
    const missingMessage = !message.value.trim();

    if (missingContact) email.setCustomValidity(translate('validation.contact'));
    else if (invalidEmail) email.setCustomValidity(translate('validation.email'));
    if (invalidPhone) phone.setCustomValidity(translate('validation.phone'));
    if (missingMessage) message.setCustomValidity(translate('validation.message'));

    const contactErrors = [];
    if (missingContact) contactErrors.push(translate('validation.contact'));
    if (invalidEmail) contactErrors.push(translate('validation.email'));
    if (invalidPhone) contactErrors.push(translate('validation.phone'));
    contactError.textContent = showErrors ? contactErrors.join(' ') : '';
    contactError.hidden = !showErrors || !contactErrors.length;
    messageError.textContent = translate('validation.message');
    messageError.hidden = !showErrors || !missingMessage;
    email.setAttribute('aria-invalid', String(showErrors && (missingContact || invalidEmail)));
    phone.setAttribute('aria-invalid', String(showErrors && (missingContact || invalidPhone)));
    message.setAttribute('aria-invalid', String(showErrors && missingMessage));
    return !missingContact && !invalidEmail && !invalidPhone && !missingMessage;
  }

  function showStatus(key, isError = false) {
    statusKey = key;
    status.textContent = translate(key);
    status.dataset.error = String(isError);
    status.hidden = false;
  }

  function render() {
    document.querySelectorAll('[data-contact-i18n]').forEach(element => {
      element.textContent = translate(element.dataset.contactI18n);
    });
    document.title = `${translate('title')} · Nils Schwebel`;
    document.querySelector('meta[name="description"]').content = translate('meta.description');
    document.getElementById('delivery-note').textContent = translate(`delivery.${accessKey() ? 'configured' : 'unconfigured'}`);
    document.getElementById('delivery-note').hidden = !!accessKey();
    if (statusKey) status.textContent = translate(statusKey);
    renderLesson();
    updateValidation();
    updateSendButton();
  }

  document.getElementById('clear-lesson').addEventListener('click', () => {
    window.LessonSelection?.clear();
    lesson = null;
    renderLesson();
    updateSendButton();
    email.focus();
  });
  [email, phone, message].forEach(input => input.addEventListener('input', () => {
    updateValidation();
    updateSendButton();
    if (statusKey && !sending) {
      statusKey = null;
      status.hidden = true;
    }
  }));

  // Validation uses the browser's native constraint API, including email syntax and required message.
  form.noValidate = true;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    if (!refreshLesson()) {
      status.focus();
      return;
    }
    validationShown = true;
    updateValidation(true);
    if (!form.reportValidity()) return;

    const key = accessKey();
    if (!key) {
      showStatus('status.unconfigured');
      status.focus();
      return;
    }
    const fingerprint = requestFingerprint();
    if (submittedFingerprint === fingerprint) {
      showStatus(lesson ? 'status.submittedLesson' : 'status.submitted');
      return;
    }

    const payload = {
      access_key: key,
      subject: translate('subject'),
      from_name: 'Nachhilfe Nils Schwebel',
      phone: phone.value.trim(),
      message: message.value.trim(),
      language: language(),
      botcheck: document.getElementById('botcheck')?.checked || false
    };
    if (email.value.trim()) payload.email = email.value.trim();
    if (lesson) {
      payload.lesson_date = lesson.date;
      payload.lesson_time = lesson.time;
      payload.lesson_timezone = 'Europe/Berlin';
      payload.lesson_format = translate(`lesson.format.${lesson.format}`);
      payload.lesson_duration = translate('lesson.duration');
      payload.lesson_price = translate('lesson.price');
      payload.lesson_note = translate('lesson.note');
    }

    sending = true;
    updateSendButton();
    showStatus('status.sending');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        showStatus('status.failed', true);
        return;
      }
      const result = await response.json();
      if (result.success !== true) {
        showStatus('status.failed', true);
        return;
      }
      submittedFingerprint = fingerprint;
      showStatus(lesson ? 'status.submittedLesson' : 'status.submitted');
    } catch {
      showStatus('status.uncertain', true);
    } finally {
      window.clearTimeout(timeout);
      sending = false;
      updateSendButton();
      status.focus();
    }
  });

  document.addEventListener('languagechange', render);
  window.addEventListener('pageshow', refreshLesson);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !sending) refreshLesson();
  });
  render();
})();
