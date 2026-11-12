// Local copies have the same bytes as the verified public IPFS covers.
const generatedReferences = {
  "5ef44a386faecdaa96181084e4882e31a18da27de73cd42cfd11e9dbcefa0929": "/images/team-tests/car.jpg",
  "3216864334b53f02a221dd64afbe8e5edf8a2509b3bb84325abbce4569a29b4c": "/images/team-tests/cargo-bike.jpg",
  "f62b7dc4411ce3e1b385bff1dea0dbd339a33e77da727c171591be8b83457cd5": "/images/team-tests/motorcycle.jpg",
  "02b14b8517f46590e761d63301e5362e37021cb488be5d03408a6f4b4f452df8": "/images/team-tests/van.jpg"
};
export const referenceImage = asset => {
 if (!/^ipfs:\/\/baf[a-z2-7]+$/.test(asset?.coverUri ?? '')) return null;
 return (asset.imageProvenance === 'ai-generated' && generatedReferences[asset.coverSha256]) || asset.coverUri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');
};
