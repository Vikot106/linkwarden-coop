// Shared with Next.js configuration, which is loaded before TypeScript compilation.
const supportedLocales = [
  "en",
  "it",
  "fr",
  "zh",
  "zh-TW",
  "uk",
  "pt-BR",
  "ja",
  "es",
  "de",
  "nl",
  "tr",
  "pl",
  "ru",
];

const getDefaultLocale = () => {
  const locale = process.env.DEFAULT_LANGUAGE || "zh";
  return supportedLocales.includes(locale) ? locale : "zh";
};

const getNewUserLocale = () => {
  const locale = process.env.NEW_USER_DEFAULT_LANGUAGE || getDefaultLocale();
  return supportedLocales.includes(locale) ? locale : getDefaultLocale();
};

module.exports = { supportedLocales, getDefaultLocale, getNewUserLocale };
