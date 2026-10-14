export const maxPaperExportTows = 100;

export function paperArchiveFilename(scope, exportedAt = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York' }).formatToParts(exportedAt);
  const value = type => parts.find(part => part.type === type).value;
  const date = `${value('year')}-${value('month')}-${value('day')}`;
  return `${scope === 'active' ? 'activetowpermits' : 'towpermits'}-${date}.zip`;
}
