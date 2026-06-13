import { createWriteStream, WriteStream } from 'node:fs'

export function make(path: string): WriteStream {
  return createWriteStream(path)
}
