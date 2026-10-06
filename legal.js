(() => {
  'use strict';
  const page = document.body.dataset.legalPage;
  const copy = {
    de: {
      imprint: ['Impressum', 'Anbieter- und Kontaktinformationen für die Nachhilfe von Nils Schwebel.'],
      privacy: ['Datenschutz', 'Informationen zur Verarbeitung personenbezogener Daten auf dieser Website und im Kontaktformular.']
    },
    en: {
      imprint: ['Legal notice', 'Provider and contact details for Nils Schwebel’s tutoring service.'],
      privacy: ['Privacy', 'How personal data is processed on this website and through the contact form.']
    }
  };
  function render() {
    const language = window.siteLanguage === 'en' ? 'en' : 'de';
    const [title, description] = copy[language][page];
    document.getElementById('legal-title').textContent = title;
    document.title = `${title} · Nils Schwebel`;
    document.querySelector('meta[name="description"]').content = description;
    document.querySelectorAll('[data-legal-language]').forEach(element => {
      element.hidden = element.dataset.legalLanguage !== language;
    });
    window.SiteMetadata?.update();
  }
  document.addEventListener('languagechange', render);
  render();
})();
