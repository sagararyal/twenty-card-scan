import { CoreApiClient } from 'twenty-client-sdk/core';

// A card can go on several Twenty lists. They travel as one text, names joined by "; ".
export const LIST_SEPARATOR = '; ';

export const splitLists = (value: string | null | undefined): string[] => {
  const seen = new Set<string>();

  return (value ?? '')
    .split(';')
    .map((name) => name.trim().slice(0, 200))
    .filter((name) => name && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()));
};

export const joinLists = (names: string[]): string => splitLists(names.join(';')).slice(0, 10).join(LIST_SEPARATOR);

// The lists changed most recently, newest first, offered as one-tap choices.
export const recentListNames = async (limit = 6, client = new CoreApiClient()): Promise<string[]> => {
  const result = (await client.query({
    messageLists: {
      __args: { orderBy: [{ updatedAt: 'DescNullsLast' }], first: limit },
      edges: { node: { name: true } },
    },
  })) as { messageLists: { edges: { node: { name: string | null } }[] } };

  return result.messageLists.edges.map((edge) => edge.node.name ?? '').filter(Boolean);
};
