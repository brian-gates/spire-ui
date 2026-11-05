import { Link } from "react-router";

export function NotFound() {
  return (
    <>
      <h1 className="font-spire-display text-3xl font-bold">Not found</h1>
      <p className="mt-3">There is nothing at this address. Try the <Link to="/components">component list</Link>.</p>
    </>
  );
}
