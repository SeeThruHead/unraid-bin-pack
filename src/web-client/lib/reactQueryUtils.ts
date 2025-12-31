/* eslint-disable functional/no-throw-statements */
export function throwMutationError(message: string): never {
  throw new Error(message);
}
