(() => {
  'use strict';

  const copy = {
    de: {
      skip: 'Zum Inhalt',
      'nav.about': 'Über mich', 'nav.pricing': 'Preise', 'nav.contact': 'Kontakt', 'nav.trial': 'Probestunde',
      'hero.title': 'Nachhilfe in Leipzig.',
      'hero.service': 'Persönliche Nachhilfe in Mathe und Physik',
      'hero.grades': 'Klassen 5–12', 'hero.format': 'Vor Ort oder online',
      'hero.rate': 'Ab 25 € pro Stunde', 'hero.rate.note': 'Vor Ort. Online ab 22 € pro Stunde.',
      'cta.trial': 'Kostenlose Probestunde', 'cta.about': 'Lerne mich kennen', 'cta.contact': 'Direkt Kontakt aufnehmen',
      'portrait.alt': 'Nils Schwebel an seinem Schreibtisch',
      'about.alt': 'Nils Schwebel draußen im Abendlicht',
      'about.title': 'Hi, ich bin Nils.',
      'about.body': 'Ich biete private Nachhilfe in Mathe und Physik für Schülerinnen und Schüler der Klassen 5 bis 12. Wir schauen gemeinsam, wo du Unterstützung brauchst, und arbeiten in deinem Tempo.',
      'about.format': 'Wir können uns in Leipzig treffen oder online lernen. In der kostenlosen Probestunde besprechen wir deine Fragen und Ziele und lernen uns kennen.',
      'pricing.title': 'Preise',
      'pricing.description': 'Einzelunterricht in Mathe und Physik. Die erste Probestunde ist kostenlos.',
      'pricing.inperson': 'Vor Ort', 'pricing.online': 'Online',
      'pricing.60': '60 Minuten', 'pricing.90': '90 Minuten',
      'pricing.inperson.60': '25 €', 'pricing.inperson.90': '32 €',
      'pricing.online.60': '22 €', 'pricing.online.90': '28 €',
      'footer.draft': 'Website-Entwurf', 'booking.home': 'Zur Startseite'
    },
    en: {
      skip: 'Skip to content',
      'nav.about': 'About me', 'nav.pricing': 'Pricing', 'nav.contact': 'Contact', 'nav.trial': 'Free trial',
      'hero.title': 'Private tutoring in Leipzig.',
      'hero.service': 'Personal tutoring in maths and physics',
      'hero.grades': 'Grades 5–12', 'hero.format': 'In person or online',
      'hero.rate': 'From €25 per hour', 'hero.rate.note': 'In person. Online from €22 per hour.',
      'cta.trial': 'Book a free trial', 'cta.about': 'Get to know me', 'cta.contact': 'Get in touch directly',
      'portrait.alt': 'Nils Schwebel at his desk',
      'about.alt': 'Nils Schwebel outdoors in the evening light',
      'about.title': 'Hi, I’m Nils.',
      'about.body': 'I offer private tutoring in maths and physics for pupils in grades 5–12. Together, we look at where you need support and work at your pace.',
      'about.format': 'We can meet in Leipzig or learn online. In the free trial lesson, we’ll discuss your questions and goals and get to know each other.',
      'pricing.title': 'Pricing',
      'pricing.description': 'One-to-one tutoring in maths and physics. Your first trial lesson is free.',
      'pricing.inperson': 'In person', 'pricing.online': 'Online',
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
