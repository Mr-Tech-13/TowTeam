const messages = {
  en: {
    username: 'Username', password: 'Password', login: 'Log In', loading: 'Loading...', active: 'Active', setup: 'Setup', history: 'History',
    refresh: 'Reset filters and refresh', logout: 'Log out', reportIssue: 'Report Issue', confirmTow: 'Confirm Tow Details', menu: 'Menu', saveContinue: 'Save and Continue',
    theme: 'Theme', language: 'Language', dark: 'Dark', light: 'Light', contrast: 'High contrast', system: 'Device',
    airline: 'Airline', flight: 'Inbound flight number', aircraftType: 'Aircraft type', eta: 'ETA', towFrom: 'Tow from', towTo: 'Tow to', aircraftReg: 'Aircraft Reg', driver: 'Tractor Driver', headset: 'Headset Operator', leftWalker: 'Wing Walker LH', rightWalker: 'Wing Walker RH', otherTeam: 'Other team members', notes: 'Notes', needsReview: 'Needs Review'
  },
  es: {
    username: 'Usuario', password: 'Contraseña', login: 'Iniciar sesión', loading: 'Cargando...', active: 'Activos', setup: 'Preparar', history: 'Historial',
    refresh: 'Restablecer filtros y actualizar', logout: 'Cerrar sesión', reportIssue: 'Reportar problema', confirmTow: 'Confirmar detalles del remolque', menu: 'Menú', saveContinue: 'Guardar y continuar',
    theme: 'Tema', language: 'Idioma', dark: 'Oscuro', light: 'Claro', contrast: 'Alto contraste', system: 'Dispositivo',
    airline: 'Aerolínea', flight: 'Número de vuelo entrante', aircraftType: 'Tipo de aeronave', eta: 'ETA', towFrom: 'Remolcar desde', towTo: 'Remolcar hacia', aircraftReg: 'Matrícula', driver: 'Conductor del tractor', headset: 'Operador de auriculares', leftWalker: 'Caminante de ala izq.', rightWalker: 'Caminante de ala der.', otherTeam: 'Otros miembros', notes: 'Notas', needsReview: 'Necesita revisión'
  }
};

export function translate(language, key) {
  return messages[language]?.[key] || messages.en[key] || key;
}
