export const nivNotice = 'Scripture quotations taken from The Holy Bible, New International Version®, NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide.';
const statuses = ['Copyright Review Needed', 'Standard Quotation Terms Verified', 'Permission Requested', 'Permission Granted', 'Permission Not Required — Verified', 'Licensing Issue'];
const checks = ['Wording and references reviewed', 'Translation identification reviewed', 'Acknowledgment and placement reviewed', 'Applicable permissions or license reviewed', 'Format and distribution restrictions reviewed'];

export function publicationReady(record, translation) {
  const approved = record.status === statuses[3];
  const verified = [statuses[1], statuses[4]].includes(record.status);
  const clearance = approved ? record.evidence?.trim() : verified && (!record.highRisk || record.evidence?.trim());
  return Boolean(translation && record.reference?.trim() && clearance && record.notes?.trim()
    && (record.kind === 'Reference only' || (record.text?.trim() && record.source?.trim()))
    && (!['Exact quotation','Excerpt'].includes(record.kind) || ((record.notice?.trim() || translation === 'NIV') && record.location))
    && checks.every((_, index) => record['check' + index]));
}

export function scriptureReview(scope, record, inherited, onChange, flagged = false) {
  const panel = document.createElement('details');
  panel.className = 'design-group scripture-review';
  const summary = document.createElement('summary');
  summary.textContent = 'Scripture Copyright & Permissions · ' + scope;
  panel.append(summary);
  const grid = document.createElement('div');
  grid.className = 'design-fields';
  panel.append(grid);
  const reference = document.createElement('p');
  reference.className = 'wide';
  const status = document.createElement('p');
  status.className = 'wide';
  status.setAttribute('role','status');
  const translation = () => record.translation || inherited || 'NIV';

  function update() {
    reference.textContent = record.reference ? record.reference + ' (' + translation() + ')' : 'Preferred translation: ' + translation();
    status.textContent = publicationReady({...record, highRisk: flagged || ['Physical print-on-demand','Print and digital','Merchandise'].includes(record.scope) || record.highRisk}, translation())
      ? 'Scripture review complete. Artwork approval is tracked separately.'
      : 'Publishing review incomplete.';
  }

  function field(key, title, choices, long = false, initial = '') {
    const label = document.createElement('label');
    if (long) label.className = 'wide';
    label.append(title);
    const input = document.createElement(choices ? 'select' : long ? 'textarea' : 'input');
    for (const choice of choices || []) {
      const option = document.createElement('option');
      option.value = choice;
      option.textContent = choice || (key === 'translation' ? 'Inherit collection default' : 'Choose a location');
      input.append(option);
    }
    input.value = record[key] ?? initial;
    input.addEventListener(choices ? 'change' : 'input', () => {
      record[key] = input.value;
      for (const checkbox of grid.querySelectorAll('input[type=checkbox][data-review]')) {
        record[checkbox.dataset.review] = false;
        checkbox.checked = false;
      }
      update();
      onChange();
    });
    label.append(input);
    grid.append(label);
  }

  const translations = ['NIV', 'NIrV', 'KJV', 'NKJV', 'ESV', 'NLT', 'CSB', 'NASB', 'NRSVue', 'WEB'];
  if (inherited) translations.unshift('');
  field('translation', 'Bible translation', translations, false, inherited ? '' : 'NIV');
  field('reference', 'Scripture reference');
  field('kind', 'Wording type', ['Reference only', 'Exact quotation', 'Excerpt', 'Paraphrase', 'Modified wording'], false, 'Reference only');
  field('text', 'Scripture text or paraphrase (paste from your source)', null, true);
  field('source', 'Authorized source / edition and verification notes', null, true);
  field('location', 'Acknowledgment placement', ['', 'Copyright page', 'Credits page', 'PDF collection copyright page', 'Product documentation', 'On product where required']);
  field('notice', 'Custom acknowledgment or license-required wording', null, true);
  field('status', 'Permission status', statuses, false, statuses[0]);
  field('notes', 'Permission scope, terms, distribution and reviewer notes', null, true);
  field('scope', 'Format and distribution', ['', 'Private / noncommercial', 'Digital printable', 'Physical print-on-demand', 'Print and digital', 'Merchandise']);
  field('evidence', 'License document link, file location or permission reference', null, true);
  const notice = document.createElement('p');
  notice.className = 'wide';
  notice.textContent = 'NIV acknowledgment template: ' + nivNotice;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn';
  copy.textContent = 'Copy acknowledgment';
  copy.addEventListener('click', async () => {
    try {
      const wording = record.notice?.trim() || (translation() === 'NIV' ? nivNotice : '');
      if (!wording) { status.textContent = 'Enter the acknowledgment required for this translation.'; return; }
      await navigator.clipboard.writeText(wording);
      status.textContent = 'Acknowledgment copied.';
    } catch { status.textContent = 'Copy the acknowledgment directly from the section above.'; }
  });
  grid.append(copy);
  grid.append(notice);
  const advisory = document.createElement('p');
  advisory.className = 'wide';
  advisory.textContent = (flagged ? 'Additional licensing review flagged for this format. ' : '') + 'Review scripture-centered coloring books, art, cards and merchandise individually. Adding an acknowledgment does not establish permission. Compare excerpts, paraphrases and modified wording with the authorized source and label them accordingly.';
  grid.append(advisory);
  for (const [url, label] of [['https://www.biblica.com/permissions/', 'Biblica quotation and licensing guidelines'], ['https://www.biblica.com/permission-request-form/', 'Biblica permission request']]) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    grid.append(link);
  }
  checks.forEach((title, index) => {
    const key = 'check' + index;
    const label = document.createElement('label');
    label.className = 'design-check wide';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.review = key;
    input.checked = !!record[key];
    input.addEventListener('change', () => {
      record[key] = input.checked;
      update();
      onChange();
    });
    label.append(input, title);
    grid.append(label);
  });
  update();
  grid.append(reference, status);
  return panel;
}
