export function validateToolInput(schema: any, value: unknown, path = 'arguments'): void {
  if (!schema) return;
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
    const object = value as Record<string, unknown>;
    for (const key of schema.required || []) if (!(key in object)) throw new Error(`${path}.${key} is required`);
    for (const [key, item] of Object.entries(object)) {
      if (!schema.properties?.[key]) {
        if (schema.additionalProperties === false) throw new Error(`${path}.${key} is not allowed`);
      } else validateToolInput(schema.properties[key], item, `${path}.${key}`);
    }
  } else if (schema.type === 'string' && typeof value !== 'string') throw new Error(`${path} must be a string`);
  else if (schema.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)) throw new Error(`${path} must be a positive integer`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} is outside allowed values`);
}
