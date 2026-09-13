// Capture observed tool evidence, never infer retrieval from agent prose/URLs.
export function researchEvent(message) {
  if (message.method !== 'item/completed') return null;
  const item = message.params?.item;
  if (!item) return null;
  const web = item.type === 'webSearch';
  const tool = ['mcpToolCall', 'dynamicToolCall'].includes(item.type)
    && /(?:web|search|browse|fetch)/i.test(`${item.server || ''} ${item.tool || ''}`);
  if (!web && !tool) return null;
  // Store returned evidence only, not tool arguments that may contain credentials.
  return {observedAt: new Date().toISOString(), itemId: item.id,
    type: item.type, status: item.status || 'unknown',
    action: web ? item.action : undefined,
    result: item.result ?? item.contentItems ?? null,
    error: item.error ?? null,
    interpretation: 'Observed tool event; does not certify source review or musical influence.'};
}
