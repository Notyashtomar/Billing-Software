/**
 * Whether the BHS package price already contains airport concession.
 * comprehensive — concession is inside the BHS package
 * non_comprehensive — concession is charged separately on the airline invoice
 * mixed — scheduled and non-scheduled (or BHS vs another band) disagree
 */

const CONCESSION = /concession|royalt|airport fee/i;
const INCLUDE = /\b(includ(?:e|es|ed|ing)|inclusive)\b/i;
const EXCLUDE = /\b(exclud(?:e|es|ed|ing)|exclusive)\b/i;

function clean(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionsConcession(text) {
  return CONCESSION.test(text);
}

function isInclude(text) {
  return INCLUDE.test(text);
}

function isExclude(text) {
  return EXCLUDE.test(text);
}

/** Column titles such as "Comprehensive Handling" are a package name, not the concession rule. */
function isPackageTitle(text) {
  return /^(comprehensive|comprehensive handling(?: charges)?)$/i.test(clean(text));
}

function uniqueNotes(rawTexts) {
  const seen = new Set();
  const out = [];
  for (const raw of rawTexts ?? []) {
    const text = clean(raw);
    if (text.length < 8 || isPackageTitle(text)) continue;
    if (/disbursement|accounting surcharge/i.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function withoutTaxLanguage(text) {
  return text
    .replace(/\bexclusive of (?:applicable )?(?:service )?(?:tax(?:es)?|gst)\b/gi, '')
    .replace(/\bapplicable taxes are exclusive\b/gi, '');
}

/** Include/exclude that actually talks about concession or royalty, not GST. */
function concessionPolarity(text) {
  const t = withoutTaxLanguage(text).toLowerCase();
  const include =
    /inclu(?:d\w*|sive) of (?:the |applicable )*(?:concession|royalt|airport fee)/.test(t) ||
    /including concession/.test(t) ||
    /inclusive of concession/.test(t) ||
    /inclusive of all fees and royalt/.test(t) ||
    /including of concession/.test(t) ||
    /included concession/.test(t) ||
    /bhs[^.]{0,40}inclusive of concession/.test(t) ||
    /basic handling rates are inclusive/.test(t);
  const exclude =
    /exclu(?:d\w*|sive) of [^.]{0,48}(?:concession|royalt)/.test(t) ||
    /excluding concession/.test(t) ||
    /excluding of concession/.test(t) ||
    /excluding royalt/.test(t) ||
    /exclude applicable royalt/.test(t) ||
    /exc\.?\s*royalty/.test(t) ||
    /basic handling rates are excluding/.test(t) ||
    /bhs rates? are excluding/.test(t);
  if (include && exclude) return 'both';
  if (include) return 'comprehensive';
  if (exclude) return 'non_comprehensive';
  return null;
}

function bhsSide(text) {
  const t = withoutTaxLanguage(text).toLowerCase();
  const bhsInclusive =
    /bhs rates? (are |is )?(including|inclusive)/.test(t) ||
    /bhs rate inclusive/.test(t) ||
    /basic (handling )?rates? (are )?(including|included|inclusive)/.test(t) ||
    /basic rate included concession/.test(t) ||
    /basic handling rate including/.test(t) ||
    /charges defined under sub paragraph\s*1\.1 are inclusive of concession/.test(t);
  const bhsExclusive =
    /bhs rates? (are |is )?(excluding|exclusive)/.test(t) ||
    /basic handling rates are excluding/.test(t) ||
    /basic rates? (are )?excluding/.test(t);
  const adsExclusive = /ads rates are exclusive|additional (services|rates).{0,40}(excluding|exclusive)/.test(t);
  if (bhsInclusive && bhsExclusive) return 'mixed';
  if (bhsInclusive) return 'comprehensive';
  if (bhsExclusive && !adsExclusive) return 'non_comprehensive';
  if (bhsExclusive && adsExclusive && !bhsInclusive) return 'non_comprehensive';
  return null;
}

function adsOnly(text) {
  const t = text.toLowerCase();
  if (/excluding concession fee\s*\(\s*ads\s*\)/.test(t) && /bhs rate inclusive/.test(t)) return true;
  if (/^ads\b/.test(t) || /additional (services|rates).*(including|excluding)/.test(t)) {
    return !/bhs|basic handling|basic rate|all rates/.test(t);
  }
  if (/ads charges are inclusive/.test(t) || /ads rates are exclusive/.test(t)) return true;
  return false;
}

function scheduledSplit(notes) {
  const skd = notes.find(
    (text) => /\b(skd|scheduled)\b/i.test(text) && isInclude(text) && mentionsConcession(text),
  );
  const nso = notes.find(
    (text) =>
      /\b(nso|non[-\s]?scheduled)\b/i.test(text) && isExclude(text) && mentionsConcession(text),
  );
  if (!skd || !nso) return null;
  return {
    coverage: 'mixed',
    note: 'Scheduled flights include concession in the BHS package. Non-scheduled flights charge concession separately.',
  };
}

function royaltyWorkingSheet(notes) {
  const blob = notes.join(' ').toLowerCase();
  if (!/net of royalty/.test(blob) || !/add:\s*royalty/.test(blob)) return null;
  if (!/applicable rate/.test(blob)) return null;
  return {
    coverage: 'comprehensive',
    note: 'The applicable BHS rate adds royalty onto the net, so concession is already inside the package.',
  };
}

function allRatesSide(text) {
  if (!mentionsConcession(text) || adsOnly(text)) return null;
  if (bhsSide(text)) return null;
  const polarity = concessionPolarity(text);
  if (polarity === 'both') {
    const t = text.toLowerCase();
    if (/basic handling rates are inclusive/.test(t) && /ads rates are exclusive/.test(t)) {
      return 'comprehensive';
    }
    if (/paragraph\s*1\.1 are inclusive of concession/.test(t) && /2\.1/.test(t)) {
      return 'comprehensive';
    }
    return null;
  }
  return polarity;
}

/**
 * @param {string[]} rawTexts cell notes from one airline rate-card sheet
 * @returns {{ coverage: 'comprehensive' | 'non_comprehensive' | 'mixed', note?: string } | null}
 */
export function classifyBhsConcessionCoverage(rawTexts) {
  const notes = uniqueNotes(rawTexts);
  if (!notes.length) return null;

  const split = scheduledSplit(notes);
  if (split) return split;

  const royalty = royaltyWorkingSheet(notes);
  if (royalty) return royalty;

  const bhs = new Set();
  for (const text of notes) {
    const side = bhsSide(text);
    if (side === 'mixed') {
      return {
        coverage: 'mixed',
        note: 'The sheet gives different concession treatment for the BHS package and another rate band.',
      };
    }
    if (side) bhs.add(side);
  }
  if (bhs.size === 1) {
    const coverage = [...bhs][0];
    return {
      coverage,
      note:
        coverage === 'comprehensive'
          ? 'Concession is already inside the BHS package.'
          : 'Concession is charged separately from the BHS package.',
    };
  }
  if (bhs.size > 1) {
    return {
      coverage: 'mixed',
      note: 'Basic handling and another band on this sheet treat concession differently.',
    };
  }

  const sides = new Set();
  for (const text of notes) {
    const side = allRatesSide(text);
    if (side) sides.add(side);
  }
  if (sides.size === 1) {
    const coverage = [...sides][0];
    return {
      coverage,
      note:
        coverage === 'comprehensive'
          ? 'Concession is already inside the BHS package. Do not add it again on the airline invoice.'
          : 'Charge concession separately on the airline invoice. It is not inside the BHS package.',
    };
  }
  if (sides.size > 1) {
    return {
      coverage: 'mixed',
      note: 'This rate card has both inclusive and exclusive concession notes.',
    };
  }
  return null;
}

export function concessionNoteTexts(sheet, cellText) {
  const texts = [];
  const last = Math.min(sheet.rowCount || 0, 80);
  for (let rowNumber = 1; rowNumber <= last; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const max = Math.min(row.cellCount || 0, 40);
    const lead = cellText(row.getCell(1).value);
    if (/applicable rate|net of royalty|add:\s*royalty/i.test(lead)) texts.push(lead);
    const clauseLabel = cellText(row.getCell(2).value);
    for (let col = 1; col <= max; col++) {
      const text = cellText(row.getCell(col).value);
      if (!text) continue;
      if (
        !/concession|royalt|airport fee|basic handling rate|comprehensive handling/i.test(text)
      ) {
        continue;
      }
      const labeled =
        clauseLabel && clauseLabel !== text && col > 2 ? `${clauseLabel}: ${text}` : text;
      texts.push(labeled);
    }
  }
  return texts;
}
