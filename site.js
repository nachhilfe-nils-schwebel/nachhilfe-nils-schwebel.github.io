(() => {
  'use strict';

  const copy = {
    de: {
      skip: 'Zum Inhalt',
      'nav.about': 'Über mich', 'nav.pricing': 'Preise', 'nav.trial': 'Probestunde',
      'hero.title': 'Nachhilfe in Leipzig.',
      'hero.description': 'Persönliche Nachhilfe für die Klassen 5–12, vor Ort oder online. Ab 25 € pro Stunde.',
      'price.note': '25 € ist ein Beispielpreis für den Entwurf.',
      'cta.trial': 'Kostenlose Probestunde',
      'portrait.alt': 'Nils Schwebel an seinem Schreibtisch',
      'about.alt': 'Nils Schwebel draußen im Abendlicht',
      'about.title': 'Über mich',
      'about.body': 'Ich bin Nils Schwebel und biete private Nachhilfe für Schülerinnen und Schüler der Klassen 5 bis 12. Wir schauen gemeinsam, wo du Unterstützung brauchst, und arbeiten in deinem Tempo.',
      'about.format': 'Wir können uns in Leipzig treffen oder online lernen. In der kostenlosen Probestunde besprechen wir deine Fragen und Ziele und lernen uns kennen.',
      'pricing.title': 'Preise',
      'pricing.description': 'Die Probestunde ist kostenlos. Den Preis für weitere Stunden besprechen wir vorab gemeinsam.',
      'pricing.trial': 'Probestunde', 'pricing.free': 'Kostenlos',
      'pricing.lessons': 'Einzelunterricht', 'pricing.rate': 'Ab 25 € / Stunde',
      'pricing.note': 'Der angegebene Preis ist vorläufig. Preis und Stundendauer legen wir noch fest.',
      'footer.draft': 'Website-Entwurf', 'booking.home': 'Zur Startseite'
    },
    en: {
      skip: 'Skip to content',
      'nav.about': 'About me', 'nav.pricing': 'Pricing', 'nav.trial': 'Free trial',
      'hero.title': 'Private tutoring in Leipzig.',
      'hero.description': 'Personal tutoring for pupils in grades 5–12, in person or online. From €25 per hour.',
      'price.note': '€25 is an example price for this draft.',
      'cta.trial': 'Book a free trial',
      'portrait.alt': 'Nils Schwebel at his desk',
      'about.alt': 'Nils Schwebel outdoors in the evening light',
      'about.title': 'About me',
      'about.body': 'I’m Nils Schwebel, and I offer private tutoring for pupils in grades 5–12. Together, we look at where you need support and work at your pace.',
      'about.format': 'We can meet in Leipzig or learn online. In the free trial lesson, we’ll discuss your questions and goals and get to know each other.',
      'pricing.title': 'Pricing',
      'pricing.description': 'The trial lesson is free. We’ll agree on the price of further lessons beforehand.',
      'pricing.trial': 'Trial lesson', 'pricing.free': 'Free',
      'pricing.lessons': 'One-to-one tutoring', 'pricing.rate': 'From €25 / hour',
      'pricing.note': 'The price shown is provisional. The final rate and lesson duration are still to be agreed.',
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
        ? 'Persönliche Nachhilfe mit Nils Schwebel für die Klassen 5–12. In Leipzig und online. Starte mit einer kostenlosen Probestunde.'
        : 'Personal tutoring with Nils Schwebel for pupils in grades 5–12. In Leipzig and online. Start with a free trial lesson.';
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
