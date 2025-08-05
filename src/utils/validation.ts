import { z } from 'zod';

// Common validation schemas
export const solanaAddressSchema = z.string().min(32).max(44);
export const uuidSchema = z.string().uuid();

// Character validation schemas
export const skillNameSchema = z.enum([
  'attack', 'strength', 'defense', 'magic', 'projectiles', 
  'vitality', 'crafting', 'luck', 'gathering'
]);

export const statNameSchema = z.enum(['str', 'agi', 'int', 'vit', 'luk']);

export const characterClassSchema = z.enum([
  'Adventurer', 'Warrior', 'Mage', 'Ranger', 'Rogue'
]);

// Skill type for database operations
export const skillTypeSchema = z.enum([
  'combat', 'magic', 'crafting', 'exploration', 'gambling'
]);

// Request validation helpers
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function isValidSolanaAddress(address: string): boolean {
  return solanaAddressSchema.safeParse(address).success;
}

export function isValidUUID(uuid: string): boolean {
  return uuidSchema.safeParse(uuid).success;
}