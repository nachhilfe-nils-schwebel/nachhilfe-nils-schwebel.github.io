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
      'about.approach': 'Ich unterstütze dich in Mathe und/oder Physik von Klasse 5 bis 12. Ich habe bereits Schülerinnen und Schüler bis zu ihren Prüfungen begleitet und ihnen geholfen, gute Ergebnisse zu erzielen. Zu sehen, wie sich ihre Mühe auszahlt und sie ihre Ziele erreichen, ist für mich besonders erfüllend.',
      'about.format': 'Wir können uns in Leipzig treffen oder online lernen. In der kostenlosen Probestunde lernen wir uns kennen, besprechen deine Fragen und Ziele und schauen, wie ich dich am besten unterstützen kann. 🤝',
      'lessons.title': 'So gehen wir es an',
      'lessons.trial': 'In der kostenlosen Probestunde finden wir gemeinsam heraus, wo du Unterstützung brauchst. Wir schauen uns deine Arbeiten an und bearbeiten zusammen Aufgaben. Dadurch erfahre ich, was für dich funktioniert und wie wir zukünftige Stunden effektiv gestalten.',
      'lessons.preparation': 'Bevor wir mit einer Nachhilfeeinheit starten, schaue ich mir deine Materialien an und bereite Erklärungen und Aufgaben vor. Deshalb ist es gut, wenn du mir schon vorab Schwerpunkte gibst, auf die wir uns konzentrieren.',
      'lessons.pace': 'Wir arbeiten in deinem Tempo. Jede Frage ist erlaubt! Wenn wir die Dinge Schritt für Schritt angehen, kannst du schon bald Aufgaben selbstständig und sicher lösen. 💪',
      'lessons.alt': 'Zwei Personen arbeiten gemeinsam an Aufgaben mit Notizen und Laptops',
      'pricing.title': 'Preise',
      'pricing.description': 'Einzelunterricht in Mathe und Physik. Die erste Probestunde ist kostenlos.',
      'pricing.duration': 'Dauer', 'pricing.inperson': 'Vor Ort', 'pricing.online': 'Online',
      'pricing.60': '60 Minuten', 'pricing.90': '90 Minuten',
      'pricing.inperson.60': '25 €', 'pricing.inperson.90': '32 €',
      'pricing.online.60': '22 €', 'pricing.online.90': '28 €',
      'footer.imprint': 'Impressum', 'footer.privacy': 'Datenschutz', 'footer.navigation': 'Rechtliche Informationen',
      'privacy.form.note': 'Informationen zur Verarbeitung deiner Angaben:',
      'legal.home': 'Zurück zur Startseite', 'booking.home': 'Zur Startseite'
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
      'about.approach': 'I help pupils in grades 5–12 with maths and/or physics. I’ve supported pupils all the way through their exams and helped them achieve good results. Seeing their hard work pay off and watching them reach their goals is especially rewarding for me.',
      'about.format': 'We can meet in Leipzig or learn online. In the free trial lesson, we’ll get to know each other, discuss your questions and goals, and work out how I can best support you. 🤝',
      'lessons.title': 'How we’ll work together',
      'lessons.trial': 'In the free trial lesson, we’ll find out together where you need support. We’ll look at your schoolwork and work through problems together. This helps me understand what works for you and how to make future lessons effective.',
      'lessons.preparation': 'Before each tutoring session, I’ll look through your materials and prepare explanations and exercises. It helps if you let me know in advance which topics you’d like us to focus on.',
      'lessons.pace': 'We’ll work at your pace. Every question is welcome! By taking things step by step, you’ll soon be able to solve problems independently and with confidence. 💪',
      'lessons.alt': 'Two people working through tasks together with notes and laptops',
      'pricing.title': 'Pricing',
      'pricing.description': 'One-to-one tutoring in maths and physics. Your first trial lesson is free.',
      'pricing.duration': 'Duration', 'pricing.inperson': 'In person', 'pricing.online': 'Online',
      'pricing.60': '60 minutes', 'pricing.90': '90 minutes',
      'pricing.inperson.60': '€25', 'pricing.inperson.90': '€32',
      'pricing.online.60': '€22', 'pricing.online.90': '€28',
      'footer.imprint': 'Legal notice', 'footer.privacy': 'Privacy', 'footer.navigation': 'Legal information',
      'privacy.form.note': 'How your information is processed:',
      'legal.home': 'Back to home', 'booking.home': 'Back to home'
    }
  };

  function updatePageMetadata() {
    const canonical = document.querySelector('link[rel="canonical"][data-canonical-base]');
    if (!canonical) return;
    const english = document.documentElement.lang === 'en';
    const url = new URL(canonical.dataset.canonicalBase);
    if (english) url.searchParams.set('lang', 'en');
    canonical.href = url.href;
    const description = document.querySelector('meta[name="description"]')?.content || '';
    const values = {
      'og:title': document.title, 'og:description': description, 'og:url': url.href,
      'og:locale': english ? 'en_GB' : 'de_DE', 'og:locale:alternate': english ? 'de_DE' : 'en_GB',
      'og:image:alt': copy[english ? 'en' : 'de']['portrait.alt'],
      'twitter:title': document.title, 'twitter:description': description,
      'twitter:image:alt': copy[english ? 'en' : 'de']['portrait.alt']
    };
    for (const [key, value] of Object.entries(values)) {
      const element = document.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
      if (element) element.content = value;
    }
  }
  window.SiteMetadata = Object.freeze({ update: updatePageMetadata });

  const languageFromUrl = new URLSearchParams(window.location.search).get('lang');
  window.siteLanguage = languageFromUrl === 'en' ? 'en' : 'de';

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
    const footer = document.querySelector('.footer-links');
    if (footer) footer.setAttribute('aria-label', copy[language]['footer.navigation']);
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
    }
    updatePageMetadata();
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { language } }));
  }

  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.language, true)));
  document.querySelectorAll('[data-year]').forEach(element => {
    element.textContent = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(new Date());
  });
  setLanguage(window.siteLanguage);
})();
