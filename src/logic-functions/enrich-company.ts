import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { ai, Response } from 'twenty-sdk/logic-function';

import { meta, normalizeUrl, readPage, visibleText } from 'src/utils/website';

// "Enrich" on the review screen: reads the company's own website and suggests a short
// profile. Returns suggestions only; nothing is saved until the person presses Create.

export type EnrichResult = {
  success: boolean;
  error?: string;
  sourceUrl?: string;
  summary?: string;
  industry?: string;
  employees?: string;
  headquarters?: string;
  companyLinkedin?: string;
};

const respond = (body: EnrichResult, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const handler = async (event: RoutePayload): Promise<Response> => {
  const body = event.body as { website?: unknown; companyName?: unknown } | null;
  const url = normalizeUrl(typeof body?.website === 'string' ? body.website : '');

  if (!url) {
    return respond({ success: false, error: 'Add a website for the company first' }, 400);
  }

  // Home page first; an About page often says more.
  const pages: { url: string; text: string; description: string; title: string; linkedin: string }[] = [];

  for (const candidate of [url, new URL('/about', url), new URL('/about-us', url)]) {
    const page = await readPage(candidate);

    if (!page) continue;

    pages.push({
      url: page.finalUrl,
      title: page.html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '',
      description: meta(page.html, 'description') || meta(page.html, 'og:description'),
      linkedin: page.html.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[A-Za-z0-9_\-%.]+/i)?.[0] ?? '',
      text: visibleText(page.html),
    });

    if (pages.length >= 2) break;
  }

  if (pages.length === 0) {
    return respond({ success: false, error: `Could not read ${url.hostname}` }, 422);
  }

  const companyName = typeof body?.companyName === 'string' ? body.companyName.slice(0, 200) : '';
  const input = pages
    .map((page) => `URL: ${page.url}\nTitle: ${page.title}\nDescription: ${page.description}\nLinkedIn link on page: ${page.linkedin}\nText: ${page.text}`)
    .join('\n\n---\n\n');

  const result = await ai.generate({
    instructions:
      'You write a short, factual company profile for a CRM, using only the website text given. ' +
      'Never use outside knowledge and never guess: leave a field empty if the text does not say it. ' +
      'summary: one or two plain sentences on what the organisation does and for whom. ' +
      'employees: a number or range only if the text states it. headquarters: city and country if stated. ' +
      'companyLinkedin: only a linkedin.com/company URL that appears in the text.',
    input: `Company on the business card: ${companyName}\n\n${input}`,
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string', description: 'One or two sentences' },
          industry: { type: 'string', description: 'Sector in a few words' },
          employees: { type: 'string', description: 'Number or range, only if stated' },
          headquarters: { type: 'string', description: 'City, country, only if stated' },
          companyLinkedin: { type: 'string', description: 'linkedin.com/company URL from the page' },
        },
        required: ['summary', 'industry', 'employees', 'headquarters', 'companyLinkedin'],
      },
    },
  });

  if (!result.success || !result.object) {
    return respond({ success: false, error: result.error ?? 'The model returned nothing' }, 502);
  }

  const profile = result.object as Omit<EnrichResult, 'success' | 'error' | 'sourceUrl'>;

  return respond({
    success: true,
    sourceUrl: pages[0].url,
    ...profile,
    companyLinkedin: profile.companyLinkedin || pages.find((page) => page.linkedin)?.linkedin || '',
  });
};

export default defineLogicFunction({
  universalIdentifier: '6343a014-48de-4138-8298-b8c206f7068a',
  name: 'enrich-company',
  description: "Suggests a company profile from the company's own website.",
  timeoutSeconds: 60,
  handler,
  httpRouteTriggerSettings: {
    path: '/cards/enrich',
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
