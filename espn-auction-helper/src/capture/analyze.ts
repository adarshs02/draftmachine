import { splitLines, type Frame } from './frames'

export interface VerbStat {
  verb: string
  count: number
  samples: string[]
}

export function verbStats(frames: Frame[], dir: Frame['dir'] = 'in', sampleCount = 5): VerbStat[] {
  const byVerb = new Map<string, VerbStat>()
  for (const frame of frames) {
    if (frame.dir !== dir) continue
    for (const line of splitLines(frame.data)) {
      const verb = line.split(/\s+/)[0]
      const stat = byVerb.get(verb) ?? { verb, count: 0, samples: [] }
      stat.count++
      if (stat.samples.length < sampleCount) stat.samples.push(line)
      byVerb.set(verb, stat)
    }
  }
  return [...byVerb.values()].sort((a, b) => b.count - a.count)
}
