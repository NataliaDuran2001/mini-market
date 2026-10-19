// Intl puts a no-break space (U+00A0) between "Bs" and the amount; the app shows a plain space.
const NO_BREAK_SPACE = new RegExp(String.fromCharCode(0xa0), 'g');

/**
 * Centavos as the app shows them (`Bs 11.500,00`, es-BO). The specs compare the screen with the
 * numbers they computed themselves, so the expected text is built here and never typed by hand.
 */
export function formatBs(centavos: number): string {
  return new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency: 'BOB',
    useGrouping: 'always',
  })
    .format(centavos / 100)
    .replace(NO_BREAK_SPACE, ' ');
}

/** Bs as a person types them into a form (`1500.5` becomes `1500,50`). */
export function typedBs(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',');
}
