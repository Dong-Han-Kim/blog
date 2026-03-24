export function isHoneypotFilled(honeypotValue: string | undefined): boolean {
  return !!honeypotValue && honeypotValue.length > 0;
}
