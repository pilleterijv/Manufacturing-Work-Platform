type CaseAccess = {
  createdBy: string;
  ownerId: string;
  reviewerId: string;
  participantIds?: unknown;
  actions: { id: string; ownerId: string }[];
};
export function problemAccess(user: { id: string; role: string }, record: CaseAccess) {
  const participant = [
    record.createdBy,
    record.ownerId,
    record.reviewerId,
    ...(Array.isArray(record.participantIds) ? record.participantIds : []),
  ].includes(user.id);
  const admin = user.role === "Admin";
  return {
    editCase: admin || participant || record.actions.some((a) => a.ownerId === user.id),
    requirements: admin,
    assignTeam: admin || user.id === record.createdBy || user.id === record.ownerId,
    updateActionIds: record.actions
      .filter((a) => admin || participant || a.ownerId === user.id)
      .map((a) => a.id),
  };
}
export function sameRequirements(
  a: { fields: string[]; actionTypes: readonly string[]; requireAction: boolean },
  b: typeof a
) {
  return (
    a.requireAction === b.requireAction &&
    JSON.stringify([...new Set(a.fields)].sort()) === JSON.stringify([...new Set(b.fields)].sort()) &&
    JSON.stringify([...new Set(a.actionTypes)].sort()) === JSON.stringify([...new Set(b.actionTypes)].sort())
  );
}
