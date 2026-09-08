// Auto-translation for the free-text notes an associate types (the
// "Course of action" note per flagged item, and the overall
// "Additional notes") — a different problem from js/i18n.js, which
// only translates a fixed set of strings this app itself wrote. Notes
// are whatever an associate actually typed, in whichever language they
// had selected at the time (recorded once, per submission, as
// `language` — see js/app.js's beginWalkthrough).
//
// Uses MyMemory's free translation API: no signup, no API key, no
// billing account — the same free-tier-only approach already used for
// photo storage (base64-in-Firestore instead of Cloud Storage). In
// exchange, it's a third-party free service with no uptime guarantee,
// a modest daily quota, and occasionally rougher translation quality
// than a paid API. The original text is always shown regardless —
// this only ever adds a translated line, never replaces it.

const translationCache = new Map();

async function translateText(text, sourceLang, targetLang) {
  if (!text || !text.trim() || !sourceLang || !targetLang || sourceLang === targetLang) return null;
  const cacheKey = `${sourceLang}|${targetLang}|${text}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    let translated = data?.responseData?.translatedText;
    // The free tier returns an in-band warning string (HTTP 200) once a
    // day's quota is used up, rather than an error — treat that as "no
    // translation available" instead of showing it as if it were one.
    if (!translated || /MYMEMORY WARNING/i.test(translated) || translated.trim().toLowerCase() === text.trim().toLowerCase()) {
      translationCache.set(cacheKey, null);
      return null;
    }
    translationCache.set(cacheKey, translated);
    return translated;
  } catch {
    return null;
  }
}
