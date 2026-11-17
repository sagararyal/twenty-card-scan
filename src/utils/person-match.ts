import { type CoreApiClient } from 'twenty-client-sdk/core';

// Who on the card is already in Twenty. Email is certain (any email on the card, main or
// extra on the record). A same name with no shared email may be the same person with a
// second job, or someone else: it is never merged on its own, review asks first.

export type PersonMatch = { id: string; name: string; email: string };

type PersonNode = {
  id: string;
  name: { firstName: string | null; lastName: string | null } | null;
  emails: { primaryEmail: string | null } | null;
};

const toMatch = (node: PersonNode): PersonMatch => ({
  id: node.id,
  name: [node.name?.firstName, node.name?.lastName].filter(Boolean).join(' '),
  email: node.emails?.primaryEmail ?? '',
});

const escapeLike = (value: string) => value.replace(/[%_\\]/g, (char) => `\\${char}`);

export const findPersonByEmails = async (client: CoreApiClient, emails: string[]): Promise<PersonMatch | null> => {
  for (const email of emails.map((value) => value.trim()).filter(Boolean)) {
    const found = (await client.query({
      people: {
        __args: {
          filter: {
            or: [
              { emails: { primaryEmail: { ilike: escapeLike(email) } } },
              { emails: { additionalEmails: { like: `%${escapeLike(email)}%` } } },
            ],
          },
          first: 1,
        },
        edges: { node: { id: true, name: { firstName: true, lastName: true }, emails: { primaryEmail: true } } },
      },
    })) as { people: { edges: { node: PersonNode }[] } };

    if (found.people.edges[0]) return toMatch(found.people.edges[0].node);
  }

  return null;
};

export const findPersonByName = async (
  client: CoreApiClient,
  firstName: string,
  lastName: string,
): Promise<PersonMatch | null> => {
  const first = firstName.trim().split(/\s+/)[0] ?? '';
  const last = lastName.trim();

  if (!first || !last) return null;

  const found = (await client.query({
    people: {
      __args: {
        filter: {
          and: [
            { name: { firstName: { ilike: `${escapeLike(first)}%` } } },
            { name: { lastName: { ilike: escapeLike(last) } } },
          ],
        },
        first: 1,
      },
      edges: { node: { id: true, name: { firstName: true, lastName: true }, emails: { primaryEmail: true } } },
    },
  })) as { people: { edges: { node: PersonNode }[] } };

  return found.people.edges[0] ? toMatch(found.people.edges[0].node) : null;
};
