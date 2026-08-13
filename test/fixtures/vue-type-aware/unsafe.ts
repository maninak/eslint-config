// Fixture: the same unsafe call in a plain .ts file, to prove the option changes only
// whether SFCs are covered and never the pre-existing .ts behaviour.
const payload = JSON.parse('{}')

export function sendFromTs(value: string): string {
  return value
}

export const sentFromTs = sendFromTs(payload.field)
