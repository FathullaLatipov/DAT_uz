import { createI18n, type I18n } from "./create";
import { MESSAGES } from "./messages";

let english: I18n | undefined;

/** English translator for code that has no request language (tests, background jobs, scripts). */
export const englishI18n = () => (english ??= createI18n("en", MESSAGES.en));
