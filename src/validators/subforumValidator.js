const { z } = require('zod');

const createSubforumSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().optional(),
});

module.exports = { createSubforumSchema };
