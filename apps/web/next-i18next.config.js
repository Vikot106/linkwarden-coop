const { supportedLocales, getDefaultLocale } = require("./lib/shared/language");

/** @type {import('next-i18next').UserConfig} */
module.exports = {
  i18n: {
    defaultLocale: getDefaultLocale(),
    locales: supportedLocales,
    localeDetection: false,
  },
  reloadOnPrerender: process.env.NODE_ENV === "development",
};
