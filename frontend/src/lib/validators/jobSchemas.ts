import * as z from 'zod';

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const registerSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const jobNameSchema = z.object({
  name: z.string().min(3, "Job name must be at least 3 characters."),
});

export const customFieldSchema = z.object({
  label: z.string().min(1, "Field label is required."),
  hint: z.string().optional(),
});
