import getCollections from "../getCollections";

export default async function getCollectionById(
  userId: number,
  collectionId: number
) {
  const result = await getCollections(userId);
  const collection = result.response.find((c) => c.id === collectionId);
  return collection
    ? { response: collection, status: 200 }
    : { response: "Collection is not accessible.", status: 404 };
}
