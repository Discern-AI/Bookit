export function normalizeAuthorName(value: string) {
  const displayName = value.trim().replace(/\s+/g, " ");
  return {
    displayName,
    authorKey: displayName.toLocaleLowerCase("en"),
  };
}

export function validAuthorName(value: string) {
  const { displayName } = normalizeAuthorName(value);
  return displayName.length >= 2 && displayName.length <= 120;
}
