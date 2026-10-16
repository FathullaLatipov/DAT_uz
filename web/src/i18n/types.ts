declare const pluralBrand: unique symbol;

type PluralForms = { one?: string; few?: string; many?: string; other: string };

/**
 * Plural forms by CLDR category. English needs one/other, Russian one/few/many/other, Uzbek only
 * other. Branded so an ordinary group of messages that merely happens to contain an `other` key
 * is never mistaken for a plural set by the key-path types.
 */
export type Plural = PluralForms & { readonly [pluralBrand]: true };

/** Marks an object as a plural set. */
export const p = (x: PluralForms) => x as Plural;
