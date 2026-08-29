import { PlaceDetail } from "@/components/PlaceDetail";

export default async function PlaceDetailPage({
  params,
}: PageProps<"/places/[id]">) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <PlaceDetail id={Number(id)} />
    </main>
  );
}
