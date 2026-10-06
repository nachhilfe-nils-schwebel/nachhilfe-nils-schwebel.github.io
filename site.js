(() => {
  'use strict';

  const copy = {
    de: {
      skip: 'Zum Inhalt',
      'nav.about': 'Über mich', 'nav.pricing': 'Preise', 'nav.contact': 'Kontakt', 'nav.trial': 'Probestunde',
      'hero.title': 'Nachhilfe in Leipzig.',
      'hero.service': 'Persönliche Nachhilfe in', 'hero.subjects': 'Mathe und Physik',
      'hero.grades': 'Klassen 5–12', 'hero.format': 'Vor Ort oder online',
      'hero.rate': 'Ab 25 € pro Stunde', 'hero.rate.format': 'vor Ort', 'hero.rate.note': 'Online ab 22 € pro Stunde',
      'cta.trial': 'Kostenlose Probestunde', 'cta.about': 'Lerne mich kennen', 'cta.or': 'oder', 'cta.contact': 'zum Kontaktformular',
      'portrait.alt': 'Nils Schwebel an seinem Schreibtisch',
      'about.alt': 'Nils Schwebel draußen im Abendlicht',
      'about.title': 'Hi, ich bin Nils.',
      'about.body': 'Ich bin 21 Jahre alt, studiere Mathematik und gebe seit 2022 Nachhilfe. Bei der Sprachschule Nachhilfe Firstclass und der Schülerhilfe habe ich in kleinen Gruppen unterrichtet, während ich seit einigen Jahren Schüler und Schülerinnen auch privat im Einzelunterricht begleite. Mir macht es Spaß, auch knifflige Themen verständlich zu machen. 😊',
      'about.approach': 'Ich unterstütze dich in Mathe und/oder Physik von Klasse 5 bis 12. Gemeinsam finden wir heraus, wo du Unterstützung brauchst, und arbeiten in deinem Tempo. Jede Frage ist erlaubt – wir gehen die Dinge Schritt für Schritt an, damit du Aufgaben selbstständig und sicher lösen kannst.',
      'about.format': 'Wir können uns in Leipzig treffen oder online lernen. In der kostenlosen Probestunde lernen wir uns kennen, besprechen deine Fragen und Ziele und schauen, wie ich dich am besten unterstützen kann. 🤝',
      'pricing.title': 'Preise',
      'pricing.description': 'Einzelunterricht in Mathe und Physik. Die erste Probestunde ist kostenlos.',
      'pricing.duration': 'Dauer', 'pricing.inperson': 'Vor Ort', 'pricing.online': 'Online',
      'pricing.60': '60 Minuten', 'pricing.90': '90 Minuten',
      'pricing.inperson.60': '25 €', 'pricing.inperson.90': '32 €',
      'pricing.online.60': '22 €', 'pricing.online.90': '28 €',
      'footer.draft': 'Website-Entwurf', 'booking.home': 'Zur Startseite'
    },
    en: {
      skip: 'Skip to content',
      'nav.about': 'About me', 'nav.pricing': 'Pricing', 'nav.contact': 'Contact', 'nav.trial': 'Free trial',
      'hero.title': 'Private tutoring in Leipzig.',
      'hero.service': 'Personal tutoring in', 'hero.subjects': 'maths and physics',
      'hero.grades': 'Grades 5–12', 'hero.format': 'In person or online',
      'hero.rate': 'From €25 per hour', 'hero.rate.format': 'in person', 'hero.rate.note': 'Online from €22 per hour',
      'cta.trial': 'Book a free trial', 'cta.about': 'Get to know me', 'cta.or': 'or', 'cta.contact': 'to the contact form',
      'portrait.alt': 'Nils Schwebel at his desk',
      'about.alt': 'Nils Schwebel outdoors in the evening light',
      'about.title': 'Hi, I’m Nils.',
      'about.body': 'I’m 21, studying mathematics, and have been tutoring since 2022. I taught small groups at Sprachschule Nachhilfe Firstclass and Schülerhilfe, and have also been supporting pupils in private one-to-one lessons for several years. I enjoy making even challenging topics easy to understand. 😊',
      'about.approach': 'I help pupils in grades 5–12 with maths and/or physics. Together, we identify where you need support and work at your pace. You can ask any question: we take things step by step so that you can solve problems independently and with confidence.',
      'about.format': 'We can meet in Leipzig or learn online. In the free trial lesson, we’ll get to know each other, discuss your questions and goals, and work out how I can best support you. 🤝',
      'pricing.title': 'Pricing',
      'pricing.description': 'One-to-one tutoring in maths and physics. Your first trial lesson is free.',
      'pricing.duration': 'Duration', 'pricing.inperson': 'In person', 'pricing.online': 'Online',
      'pricing.60': '60 minutes', 'pricing.90': '90 minutes',
      'pricing.inperson.60': '€25', 'pricing.inperson.90': '€32',
      'pricing.online.60': '€22', 'pricing.online.90': '€28',
      'footer.draft': 'Website draft', 'booking.home': 'Back to home'
    }
  };

  const languageFromUrl = new URLSearchParams(window.location.search).get('lang');
  let rememberedLanguage;
  try { rememberedLanguage = localStorage.getItem('tutoring-language'); } catch { /* URL language remains available when storage is blocked. */ }
  window.siteLanguage = ['de', 'en'].includes(languageFromUrl) ? languageFromUrl : (rememberedLanguage === 'en' ? 'en' : 'de');

  function setLanguage(language, updateUrl = false) {
    window.siteLanguage = language;
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const value = copy[language][element.dataset.i18n];
      if (value) element.textContent = value;
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(element => {
      const value = copy[language][element.dataset.i18nAlt];
      if (value) element.alt = value;
    });
    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
      button.setAttribute('aria-label', button.dataset.language === 'de' ? 'Deutsch' : 'English');
    });
    document.querySelectorAll('[data-keep-language]').forEach(link => {
      const target = new URL(link.getAttribute('href'), window.location.href);
      target.searchParams.set('lang', language);
      link.setAttribute('href', target.pathname + target.search + target.hash);
    });
    const wordmark = document.querySelector('.wordmark');
    if (wordmark) wordmark.setAttribute('aria-label', language === 'de' ? 'Nils Schwebel – Startseite' : 'Nils Schwebel – Home');
    const nav = document.querySelector('.main-nav');
    if (nav) nav.setAttribute('aria-label', language === 'de' ? 'Hauptnavigation' : 'Main navigation');
    if (document.getElementById('hero-title')) {
      document.title = language === 'de' ? 'Nachhilfe in Leipzig & online · Nils Schwebel' : 'Private tutoring in Leipzig & online · Nils Schwebel';
      document.querySelector('meta[name="description"]').content = language === 'de'
        ? 'Persönliche Nachhilfe in Mathe und Physik mit Nils Schwebel für die Klassen 5–12. In Leipzig ab 25 € und online ab 22 € pro Stunde.'
        : 'Personal maths and physics tutoring with Nils Schwebel for grades 5–12. In Leipzig from €25 and online from €22 per hour.';
    }
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', language);
      window.history.replaceState(null, '', url);
      try { localStorage.setItem('tutoring-language', language); } catch { /* Language can still be carried through links. */ }
    }
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { language } }));
  }

  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language, true)));
  document.querySelectorAll('[data-year]').forEach(element => {
    element.textContent = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(new Date());
  });
  setLanguage(window.siteLanguage);
})();
