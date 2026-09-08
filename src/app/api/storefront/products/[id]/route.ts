import { GET as listProducts } from "../route";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ error: "Invalid product id" }, { status: 400 });
  const url = new URL(req.url); url.search = ''; url.searchParams.set('id', id);
  const response = await listProducts(new Request(url, { headers: req.headers }));
  if (!response.ok) return response;
  const data = await response.json();
  return data.products[0] ? Response.json({ product: data.products[0] }) : Response.json({ error: 'Not found' }, { status: 404 });
}
