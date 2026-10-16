import type { Locale } from "../config";
import { en, type Messages } from "./en";
import { ru } from "./ru";
import { uz } from "./uz";

export const MESSAGES: Record<Locale, Messages> = { en, ru, uz };
export type { Messages };
