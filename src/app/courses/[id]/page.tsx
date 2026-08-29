import { CourseDetail } from "@/components/CourseDetail";

export default async function CoursePage({
  params,
}: PageProps<"/courses/[id]">) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <CourseDetail id={Number(id)} />
    </main>
  );
}
