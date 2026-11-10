import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const { search } = new URL(request.url);
  return redirect(`/app/settings${search}`);
};
