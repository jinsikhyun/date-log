import { z } from "zod";
export const CourseContextSchema = z.object({
  travel: z.enum(["가까이", "조금 멀어도"]).optional(),
  mood: z.enum(["조용한", "활기찬", "감성적인", "이색적인"]).optional(),
  category: z.string().trim().min(1).max(100).optional(),
});
export type CourseContext = z.infer<typeof CourseContextSchema>;
