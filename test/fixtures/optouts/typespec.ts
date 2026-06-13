import { createWriteStream, type WriteStream } from 'node:fs'

export function make(path: string): WriteStream {
  return createWriteStream(path)
}
