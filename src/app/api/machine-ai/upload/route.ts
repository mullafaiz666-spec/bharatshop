import { isLoopbackRequest, localOnlyError, saveUpload } from "@/lib/machine-ai/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLoopbackRequest(request)) return localOnlyError();
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File).slice(0, 5);
    if (!files.length) return Response.json({ error: "No files were supplied." }, { status: 400 });
    const uploads = [];
    for (const file of files) uploads.push(await saveUpload(file));
    return Response.json({ ok: true, uploads }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400, headers: { "cache-control": "no-store" } });
  }
}
