import { z } from 'zod';

/**
 * Checks whether a Zod object schema has zero required properties, which is how
 * an action decides it can run without asking for input first.
 *
 * Anything that is not an object schema counts as requiring input: the caller
 * cannot supply `{}` and expect it to validate.
 */
export function isEmptyZodObject(schema: z.ZodType): boolean {
  if (!(schema instanceof z.ZodObject)) {
    return false;
  }

  const shape = (schema as z.ZodObject).shape;

  for (const key in shape) {
    const field = shape[key];
    // Anything not explicitly `.optional()` has to be provided by the caller.
    if (!(field instanceof z.ZodOptional)) {
      return false;
    }
  }

  return true;
}
