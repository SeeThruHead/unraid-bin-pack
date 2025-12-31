// eslint-disable-next-line @typescript-eslint/no-throw-literal
export function throwMutationError(message: string): never {
  throw new Error(message);
}
