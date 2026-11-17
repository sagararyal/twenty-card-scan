import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import { CARD_PHOTO_FIELD_UNIVERSAL_IDENTIFIER } from 'src/objects/scanned-card.object';

const OBJECTS_PAGE_SIZE = 100;

// uploadFile needs the photo field's workspace id. The metadata API can't filter on
// universalIdentifier, so page through objects until the field turns up.
export const fetchPhotoFieldMetadataId = async (): Promise<string | null> => {
  let cursor: string | null = null;

  for (;;) {
    const result = (await new MetadataApiClient().query({
      objects: {
        __args: {
          paging: { first: OBJECTS_PAGE_SIZE, ...(cursor ? { after: cursor } : {}) },
          filter: {},
        },
        pageInfo: { hasNextPage: true, endCursor: true },
        edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
      },
    })) as {
      objects: {
        pageInfo: { hasNextPage: boolean | null; endCursor: string | null };
        edges: { node: { fieldsList: { id: string; universalIdentifier: string | null }[] | null } }[];
      };
    };

    const field = result.objects.edges
      .flatMap((edge) => edge.node.fieldsList ?? [])
      .find((candidate) => candidate.universalIdentifier === CARD_PHOTO_FIELD_UNIVERSAL_IDENTIFIER);

    if (field) {
      return field.id;
    }

    if (result.objects.pageInfo.hasNextPage !== true || !result.objects.pageInfo.endCursor) {
      return null;
    }

    cursor = result.objects.pageInfo.endCursor;
  }
};
