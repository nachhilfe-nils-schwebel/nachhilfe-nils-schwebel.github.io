(() => {
  'use strict';

  const copy = {
    de: {
      skip: 'Zum Inhalt', 'brand.sub': 'Persönliche Nachhilfe',
      'nav.about': 'Über mich', 'nav.pricing': 'Preise', 'nav.trial': 'Probestunde',
      'hero.eyebrow': 'Leipzig & online · Klasse 5–12',
      'hero.title1': 'Verstehen.', 'hero.title2': 'Weiterkommen.',
      'hero.description': 'Persönliche Nachhilfe, die dort ansetzt, wo du gerade stehst. Mit Ruhe, Struktur und Zeit für deine Fragen.',
      'hero.price': 'Ab 25 € / Stunde', 'price.note': '* Beispielpreis für diesen Entwurf.',
      'cta.trial': 'Kostenlose Probestunde', 'cta.about': 'Lerne mich kennen',
      'portrait.alt': 'Nils Schwebel an seinem Schreibtisch', 'portrait.caption': 'Dein Nachhilfelehrer in Leipzig',
      'strip.grades': 'Für die 5. bis 12. Klasse', 'strip.personal': 'Einzelunterricht, ganz persönlich', 'strip.format': 'In Leipzig oder online',
      'about.label': 'Über mich', 'about.title': 'Hallo, ich bin Nils.',
      'about.lead': 'Manchmal braucht es einfach jemanden, der sich Zeit nimmt und Dinge anders erklärt.',
      'about.body': 'Ich bin Nils Schwebel und biete private Nachhilfe für Schülerinnen und Schüler der Klassen 5 bis 12. Wir schauen gemeinsam, wo du Unterstützung brauchst, und gehen die nächsten Schritte in deinem Tempo.',
      'about.format': 'Wir können uns in Leipzig treffen oder online lernen. In einer kostenlosen Probestunde lernen wir uns kennen und besprechen, was du dir von der Nachhilfe wünschst.',
      'approach.label': 'So lernen wir zusammen', 'approach.title1': 'Mehr Klarheit.', 'approach.title2': 'Weniger Fragezeichen.',
      'approach.step1.title': 'Erst verstehen', 'approach.step1.body': 'Wir finden heraus, was schon gut klappt und wo es noch hakt.',
      'approach.step2.title': 'Gemeinsam üben', 'approach.step2.body': 'Wir nehmen uns den Stoff Schritt für Schritt vor – mit Raum für jede Frage.',
      'approach.step3.title': 'Sicherer weiterlernen', 'approach.step3.body': 'Du sollst nicht nur die Lösung kennen, sondern auch den Weg dorthin.',
      'pricing.label': 'Preise & Einstieg', 'pricing.title1': 'Ein klarer Preis.', 'pricing.title2': 'Ein guter Anfang.',
      'pricing.description': 'Lernen wir uns erst einmal kennen. Danach besprechen wir gemeinsam, welche Unterstützung zu dir passt.',
      'pricing.trial': 'Die Probestunde', 'pricing.trial.description': 'Kennenlernen, Fragen klären, gemeinsam starten.', 'pricing.free': 'Kostenlos',
      'pricing.lessons': 'Persönliche Nachhilfe', 'pricing.lessons.description': 'Einzelunterricht in Leipzig oder online.', 'pricing.from': 'ab', 'pricing.amount': '25 €', 'pricing.unit': '/ Stunde*',
      'pricing.note': '* 25 € ist ein vorläufiger Beispielpreis. Den endgültigen Preis und die Dauer der Stunden legen wir noch fest.',
      'closing.label': 'Der erste Schritt ist ganz einfach', 'closing.title': 'Lernen wir uns kennen.',
      'closing.description': 'Eine kostenlose Probestunde. Zeit für deine Fragen. Und ein Gefühl dafür, ob es passt.',
      'footer.location': 'Leipzig · Online · Persönlich', 'footer.draft': 'Website-Entwurf', 'booking.home': 'Zur Startseite ↗'
    },
    en: {
      skip: 'Skip to content', 'brand.sub': 'Private tutoring',
      'nav.about': 'About me', 'nav.pricing': 'Pricing', 'nav.trial': 'Free trial',
      'hero.eyebrow': 'Leipzig & online · Grades 5–12',
      'hero.title1': 'Understand.', 'hero.title2': 'Move forward.',
      'hero.description': 'Personal tutoring that meets you where you are. A calm approach, a clear structure, and time for your questions.',
      'hero.price': 'From €25 / hour', 'price.note': '* Illustrative price for this draft.',
      'cta.trial': 'Book a free trial', 'cta.about': 'Get to know me',
      'portrait.alt': 'Nils Schwebel at his desk', 'portrait.caption': 'Your private tutor in Leipzig',
      'strip.grades': 'For pupils in grades 5–12', 'strip.personal': 'One-to-one, personal support', 'strip.format': 'In Leipzig or online',
      'about.label': 'About me', 'about.title': 'Hi, I’m Nils.',
      'about.lead': 'Sometimes all it takes is someone who makes time and explains things a little differently.',
      'about.body': 'I’m Nils Schwebel, and I offer private tutoring for pupils in grades 5–12. Together, we look at where you need support and take the next steps at your pace.',
      'about.format': 'We can meet in Leipzig or learn online. A free trial lesson gives us time to get acquainted and talk about what you’re looking for from tutoring.',
      'approach.label': 'How we learn together', 'approach.title1': 'More clarity.', 'approach.title2': 'Fewer question marks.',
      'approach.step1.title': 'Understand first', 'approach.step1.body': 'We find out what’s already going well and where things get tricky.',
      'approach.step2.title': 'Practise together', 'approach.step2.body': 'We work through the material step by step, with space for every question.',
      'approach.step3.title': 'Learn with confidence', 'approach.step3.body': 'You should understand how to get to the answer, as well as the answer itself.',
      'pricing.label': 'Pricing & getting started', 'pricing.title1': 'A clear price.', 'pricing.title2': 'A good beginning.',
      'pricing.description': 'Let’s get to know each other first. Then we’ll talk about the support that works for you.',
      'pricing.trial': 'The trial lesson', 'pricing.trial.description': 'Get acquainted, ask questions, find your starting point.', 'pricing.free': 'Free',
      'pricing.lessons': 'Personal tutoring', 'pricing.lessons.description': 'One-to-one sessions in Leipzig or online.', 'pricing.from': 'from', 'pricing.amount': '€25', 'pricing.unit': '/ hour*',
      'pricing.note': '* €25 is a provisional example price. The final price and lesson duration are still to be agreed.',
      'closing.label': 'The first step is easy', 'closing.title': 'Let’s get acquainted.',
      'closing.description': 'A free trial lesson. Time for your questions. And a chance to see if we’re a good fit.',
      'footer.location': 'Leipzig · Online · Personal', 'footer.draft': 'Website draft', 'booking.home': 'Back to home ↗'
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
    const strip = document.querySelector('.service-strip');
    if (strip) strip.setAttribute('aria-label', language === 'de' ? 'Das Angebot' : 'Tutoring at a glance');
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
