export function parseLaunchArguments(rawArguments: string): string[] {
  if (!rawArguments.trim()) {
    return []
  }

  const args: string[] = []
  const tokenPattern = /"([^"]*)"|'([^']*)'|([^\s]+)/g
  let match: RegExpExecArray | null = tokenPattern.exec(rawArguments)

  while (match !== null) {
    args.push(match[1] ?? match[2] ?? match[3])
    match = tokenPattern.exec(rawArguments)
  }

  return args
}