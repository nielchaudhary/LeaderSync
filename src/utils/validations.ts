import z from "zod";

//schema validations for requests
export const scoreIngestionSchema = z.object({
  user_id: z
    .string({
      required_error: "User ID is required",
      invalid_type_error: "User ID must be a string",
    })
    .min(1, "User ID cannot be empty")
    .trim(),
  game_id: z
    .string({
      required_error: "Game ID is required",
      invalid_type_error: "Game ID must be a string",
    })
    .min(1, "Game ID cannot be empty")
    .trim(),
  score: z
    .number({
      required_error: "Score is required",
      invalid_type_error: "Score must be a number",
    })
    .min(0, "Score cannot be negative")
    .max(100, "Score cannot be greater than 100"),
});
