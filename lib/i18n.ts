export const productCopy = {
  en: { start: 'Start session', listening: 'Listening', discard: 'Discard', save: 'Save and finish' },
  es: { start: 'Iniciar sesión', listening: 'Escuchando', discard: 'Descartar', save: 'Guardar y finalizar' },
  fr: { start: 'Démarrer la session', listening: 'Écoute', discard: 'Supprimer', save: 'Enregistrer et terminer' },
  de: { start: 'Sitzung starten', listening: 'Hört zu', discard: 'Verwerfen', save: 'Speichern und beenden' },
  hi: { start: 'सत्र शुरू करें', listening: 'सुन रहा है', discard: 'हटाएँ', save: 'सहेजें और समाप्त करें' },
} as const;

export type ProductLocale = keyof typeof productCopy;
